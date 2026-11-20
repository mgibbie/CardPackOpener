// site/osk.js — the on-screen keyboard (Plans/CONTROLLER_SUPPORT_PLAN.md, Phase 2).
//
// askText() replaces window.prompt() for the game's text entry: a nickname, a
// friend code, a PC search, a pasted deck or replay code. prompt() can't be
// reached with a controller, blocks the page, and looks like the browser, not
// the game.
//
//   const name = await askText({ title: 'New name for PIKACHU?', initial: 'PIKACHU', maxLength: 12 });
//   // -> the text, or null when cancelled (exactly prompt()'s contract)
//
// Every input still works: the field is a real <input> (type, paste, Enter
// submits, Escape cancels), every key is clickable/tappable, and a
// controller drives it (Nintendo layout, like the rest of the game):
//   d-pad / stick  move over the keys      confirm (right face)  press the key
//   cancel (bottom) backspace; on an empty field, close
//   Start           OK                     top face  space      left face  shift
import { startGamepad, buttonLabel, loadPadSettings } from './gamepad.js';

const ROWS = {
	text: ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL-', "ZXCVBNM.'!"],
	code: ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'],
	number: ['123', '456', '789', '0'],   // (an amount: digits only)
};
const ACTIONS = ['SHIFT', 'SPACE', 'DEL', 'CANCEL', 'OK'];

let active = null;   // one keyboard at a time
// Balatro's button sounds (the site's UI kit, site/ui/sfx.js). Loaded when a keyboard first opens, not with this
// module: the Overworld imports this file at boot and should not pull the sound module in before anyone types.
// (The kit unlocks audio on the next pointer / key press, so the first key pressed on the keyboard already sounds.)
let sfxMod = null;
const loadSfx = () => (sfxMod = sfxMod || import('./ui/sfx.js').catch(() => null));
const sound = name => { loadSfx().then(m => { try { m && m.sfx[name](); } catch (e) {} }); };
export const oskOpen = () => !!active;

function injectStyle() {
	if (document.getElementById('osk-style')) return;
	// the kit's tokens + the m6x11 font (its classes are all prefixed, so loading it changes nothing else on the page)
	if (!document.querySelector('link[href*="/site/ui/balatro.css"]')) {
		const k = document.createElement('link'); k.rel = 'stylesheet'; k.href = '/site/ui/balatro.css'; document.head.appendChild(k);
	}
	const st = document.createElement('style');
	st.id = 'osk-style';
	st.textContent = `
	/* the Balatro look (site/ui/balatro.css): the kit's panel with the light dialog outline, keys as its grey buttons
	   standing on a darker lip (they sink when pressed), OK green, the well-style text field, the m6x11 font */
	#osk { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center;
		background: rgba(15, 22, 24, .6); font-family: var(--bal-font, 'm6x11', m6x11plus, 'Courier New', monospace); }
	#osk .osk-box { background: var(--bal-panel, #3a4b4f); border-radius: 20px; padding: 16px; width: min(560px, calc(100vw - 32px)); box-sizing: border-box;
		box-shadow: 0 10px 0 var(--bal-panel-dd, #1f2a2c), inset 0 0 0 4px var(--bal-outline-light, #bfc7d5); color: #fff; }
	#osk .osk-title { font-size: 26px; margin: 0 0 10px; text-shadow: 0 3px 0 rgba(0,0,0,.35); }
	#osk input { width: 100%; box-sizing: border-box; font: inherit; font-size: 24px; padding: 8px 12px 6px; border-radius: 10px;
		border: 3px solid var(--bal-outline-light, #bfc7d5); background: var(--bal-panel-dd, #1f2a2c); color: #fff; outline: none; }
	#osk input:focus { border-color: #fff; box-shadow: 0 0 0 3px rgba(255,255,255,.25); }
	#osk .osk-count { text-align: right; font-size: 16px; color: var(--bal-text-muted, #9fb0b3); margin: 4px 2px 6px; }
	#osk .osk-row { display: flex; gap: 6px; margin-top: 4px; justify-content: center; }
	#osk button { --b: var(--bal-grey, #5f7377); --bd: var(--bal-grey-d, #435357); flex: 1; min-width: 0; font: inherit; font-size: 20px; line-height: 1; padding: 9px 0 7px; margin-bottom: 4px;
		border-radius: 8px; border: 0; background: var(--b); color: #fff; box-shadow: 0 4px 0 var(--bd); text-shadow: 0 2px 0 rgba(0,0,0,.3);
		cursor: pointer; touch-action: manipulation; transition: transform .06s, box-shadow .06s, filter .1s; }
	#osk button:hover { filter: brightness(1.1); }
	#osk button:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--bd); }
	#osk button.osk-focus { box-shadow: 0 4px 0 var(--bd), 0 0 0 3px #fff; filter: brightness(1.12); }
	#osk button.osk-wide { flex: 2; font-size: 17px; }
	#osk button.osk-ok { --b: var(--bal-green, #4bc292); --bd: var(--bal-green-d, #33906b); }
	#osk button[data-k="CANCEL"] { --b: var(--bal-orange, #fda200); --bd: var(--bal-orange-d, #c27c00); }
	#osk .osk-hint { font-size: 15px; color: var(--bal-text-muted, #9fb0b3); margin-top: 9px; text-align: center; }`;
	document.head.appendChild(st);
}

export function askText(opts = {}) {
	if (typeof document === 'undefined') return Promise.resolve(null);
	if (active) active.finish(null);
	const { title = '', initial = '', maxLength = 64, charset = 'text', upper = false } = opts;
	injectStyle();
	loadSfx();
	return new Promise(resolve => {
		const root = document.createElement('div');
		root.id = 'osk';
		root.innerHTML = `<div class="osk-box" role="dialog" aria-modal="true"><p class="osk-title"></p>
			<input type="text" autocomplete="off" spellcheck="false"><div class="osk-count"></div><div class="osk-keys"></div>
			<div class="osk-hint"></div></div>`;
		root.querySelector('.osk-title').textContent = title;
		const input = root.querySelector('input');
		input.maxLength = maxLength;
		input.value = String(initial || '').slice(0, maxLength);
		const count = root.querySelector('.osk-count');
		let shift = upper || charset === 'code';
		const grid = [];   // rows of buttons, for 2D focus
		const keys = root.querySelector('.osk-keys');
		const rows = [...(ROWS[charset] || ROWS.text), ACTIONS];
		rows.forEach(r => {
			const row = document.createElement('div'); row.className = 'osk-row';
			const btns = [];
			for (const k of (Array.isArray(r) ? r : [...r])) {
				const b = document.createElement('button'); b.type = 'button'; b.dataset.k = k;
				if (k.length > 1) b.classList.add('osk-wide');
				if (k === 'OK') b.classList.add('osk-ok');
				b.addEventListener('click', () => press(k));
				// keep focus in the field: a focused BUTTON would hand keys back to the game
				b.addEventListener('pointerdown', e => e.preventDefault());
				row.appendChild(b); btns.push(b);
			}
			keys.appendChild(row); grid.push(btns);
		});
		const hint = root.querySelector('.osk-hint');
		const paint = () => {
			for (const b of grid.flat()) {
				const k = b.dataset.k;
				b.textContent = k === 'SHIFT' ? (shift ? '⇧ ABC' : '⇧ abc') : k.length > 1 ? k : (shift ? k : k.toLowerCase());
			}
			count.textContent = `${input.value.length}/${maxLength}`;
		};
		let fr = 1, fc = 0;   // focused key (row, col)
		const focus = (r, c) => {
			fr = (r + grid.length) % grid.length;
			fc = Math.max(0, Math.min(grid[fr].length - 1, c));
			grid.flat().forEach(b => b.classList.remove('osk-focus'));
			grid[fr][fc].classList.add('osk-focus');
		};
		const type = s => {
			const v = input.value, a = input.selectionStart ?? v.length, z = input.selectionEnd ?? v.length;
			const next = (v.slice(0, a) + s + v.slice(z)).slice(0, maxLength);
			input.value = next;
			const pos = Math.min(next.length, a + s.length);
			try { input.setSelectionRange(pos, pos); } catch (e) {}
			paint();
		};
		const del = () => {
			const v = input.value, a = input.selectionStart ?? v.length, z = input.selectionEnd ?? v.length;
			if (a !== z) { input.value = v.slice(0, a) + v.slice(z); try { input.setSelectionRange(a, a); } catch (e) {} }
			else if (a > 0) { input.value = v.slice(0, a - 1) + v.slice(a); try { input.setSelectionRange(a - 1, a - 1); } catch (e) {} }
			paint();
		};
		function press(k) {
			sound(k === 'CANCEL' ? 'back' : 'press');
			if (k === 'OK') return finish(input.value);
			if (k === 'CANCEL') return finish(null);
			if (k === 'DEL') return del();
			if (k === 'SPACE') return type(' ');
			if (k === 'SHIFT') { shift = !shift; return paint(); }
			type(shift ? k : k.toLowerCase());
		}
		input.addEventListener('input', paint);
		input.addEventListener('keydown', e => {
			e.stopPropagation();   // the game's own key listeners never see typing
			if (e.key === 'Enter') { e.preventDefault(); finish(input.value); }
			else if (e.key === 'Escape') { e.preventDefault(); finish(null); }
		});
		root.addEventListener('pointerdown', e => { if (e.target === root) { e.preventDefault(); } });

		// the controller, for everyone (guests included since 2026-10-18)
		let pad = null;
		{
			const DIR = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
			// The button that OPENED this keyboard is usually still down: this reader is new, so it would see that as a
			// fresh press and type the key under the cursor (a stray "q" in front of every entry). What it reports on its
			// first look (the next frame or two) is what was already down, and is not a press of this keyboard's.
			let live = false; requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => { live = true; })));
			pad = startGamepad({
				readPads: window.__owFakePads ? () => window.__owFakePads : undefined,
				onPress: a => {
					if (!live) return;
					if (DIR[a]) { const [dr, dc] = DIR[a]; if (dr) focus(fr + dr, Math.round(fc * grid[(fr + dr + grid.length) % grid.length].length / grid[fr].length)); else focus(fr, (fc + dc + grid[fr].length) % grid[fr].length); return; }
					if (a === 'confirm') grid[fr][fc].click();
					else if (a === 'cancel') { sound('back'); if (input.value) del(); else finish(null); }
					else if (a === 'menu') finish(input.value);
					else if (a === 'secondary') type(' ');
					else if (a === 'context') { shift = !shift; paint(); }
				},
			});
			const setHint = () => {
				const L = a => `[${buttonLabel(a, (pad && pad.kind()) || 'switch', loadPadSettings())}]`;
				hint.textContent = `D-pad move · ${L('confirm')} type the key · ${L('cancel')} delete · ${L('menu')} OK · ${L('secondary')} space · ${L('context')} shift`;
			};
			setHint(); setTimeout(setHint, 60);   // once the pad has reported its family
		}

		let done = false;
		function finish(val) {
			if (done) return;
			done = true;
			if (pad) pad.stop();
			root.remove();
			active = null;
			resolve(val == null ? null : String(val));
		}
		document.body.appendChild(root);
		paint(); focus(1, 0);
		input.focus();
		try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
		active = { finish, input, root };
	});
}
