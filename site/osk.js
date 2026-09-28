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
// submits, Escape cancels), every key is clickable/tappable, and a signed-in
// player's controller drives it (Nintendo layout, like the rest of the game):
//   d-pad / stick  move over the keys      confirm (right face)  press the key
//   cancel (bottom) backspace; on an empty field, close
//   Start           OK                     top face  space      left face  shift
import { startGamepad } from './gamepad.js';

const ROWS = {
	text: ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL-', "ZXCVBNM.'!"],
	code: ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'],
};
const ACTIONS = ['SHIFT', 'SPACE', 'DEL', 'CANCEL', 'OK'];

let active = null;   // one keyboard at a time
export const oskOpen = () => !!active;

const signedIn = () => {
	try { return !!localStorage.getItem('magepunk_mp_token_v1') && !!JSON.parse(localStorage.getItem('magepunk_mp_state_v1') || 'null')?.username; }
	catch (e) { return false; }
};

function injectStyle() {
	if (document.getElementById('osk-style')) return;
	const st = document.createElement('style');
	st.id = 'osk-style';
	st.textContent = `
	#osk { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center;
		background: rgba(8, 10, 20, .72); font-family: m6x11plus, monospace; }
	#osk .osk-box { background: #1b2033; border: 2px solid #5a6aa8; border-radius: 12px; padding: 14px; width: min(560px, calc(100vw - 32px));
		box-shadow: 0 10px 40px rgba(0,0,0,.6); color: #e8ecff; }
	#osk .osk-title { font-size: 18px; margin: 0 0 10px; }
	#osk input { width: 100%; box-sizing: border-box; font: inherit; font-size: 22px; padding: 8px 10px; border-radius: 8px;
		border: 2px solid #3d4870; background: #0f1322; color: #fff; outline: none; }
	#osk input:focus { border-color: #8fa2ff; }
	#osk .osk-count { text-align: right; font-size: 13px; opacity: .6; margin: 4px 2px 8px; }
	#osk .osk-row { display: flex; gap: 5px; margin-top: 5px; justify-content: center; }
	#osk button { flex: 1; min-width: 0; font: inherit; font-size: 17px; padding: 9px 0; border-radius: 7px; border: 2px solid transparent;
		background: #2c3452; color: #e8ecff; cursor: pointer; touch-action: manipulation; }
	#osk button:hover { background: #3a4470; }
	#osk button.osk-focus { border-color: #ffd27a; background: #424e80; }
	#osk button.osk-wide { flex: 2; }
	#osk button.osk-ok { background: #2f6b46; }
	#osk .osk-hint { font-size: 12px; opacity: .55; margin-top: 9px; text-align: center; }`;
	document.head.appendChild(st);
}

export function askText(opts = {}) {
	if (typeof document === 'undefined') return Promise.resolve(null);
	if (active) active.finish(null);
	const { title = '', initial = '', maxLength = 64, charset = 'text', upper = false } = opts;
	injectStyle();
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

		// the controller, for signed-in players (the owner's rule for controller play)
		let pad = null;
		if (signedIn()) {
			const DIR = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
			pad = startGamepad({
				readPads: window.__owFakePads ? () => window.__owFakePads : undefined,
				onPress: a => {
					if (DIR[a]) { const [dr, dc] = DIR[a]; if (dr) focus(fr + dr, Math.round(fc * grid[(fr + dr + grid.length) % grid.length].length / grid[fr].length)); else focus(fr, (fc + dc + grid[fr].length) % grid[fr].length); return; }
					if (a === 'confirm') grid[fr][fc].click();
					else if (a === 'cancel') { if (input.value) del(); else finish(null); }
					else if (a === 'menu') finish(input.value);
					else if (a === 'secondary') type(' ');
					else if (a === 'context') { shift = !shift; paint(); }
				},
			});
			hint.textContent = 'Controller: move · confirm = key · cancel = delete · START = OK · top = space · left = shift';
		} else hint.textContent = 'Type, or tap the keys. Enter = OK, Esc = cancel.';

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
