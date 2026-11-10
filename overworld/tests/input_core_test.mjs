// input_core_test.mjs — the site-wide keyboard layer (site/input.js) and the
// controller pause flag (site/gamepad.js), controls sweep B1. Pure node: the
// keyboard core takes event-like objects, the pad core takes fake pads.
//
//   node overworld/tests/input_core_test.mjs
import { KEYMAP, actionForKey, isTyping, createKeyboard, suspendInput, inputSuspended, keyLabel } from '../../site/input.js';
import { createGamepad, pausePads, padsPaused, ACTIONS } from '../../site/gamepad.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// a key event as the browser sends it (isTrusted: true unless said otherwise)
const ev = (code, key, more = {}) => ({ code, key, isTrusted: true, repeat: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...more });
const el = (tagName, more = {}) => ({ tagName, closest: sel => more.inOsk && sel === '#osk' ? {} : null, ...more });

// ---------- the owner's map ----------
const MAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
	KeyZ: 'confirm', KeyX: 'cancel', KeyC: 'secondary', KeyV: 'context', KeyQ: 'prev', KeyE: 'next', Enter: 'menu', Backspace: 'select' };
A(Object.entries(MAP).every(([code, a]) => actionForKey(ev(code, '')) === a), 'arrows/WASD move, Z=A confirm, X=B cancel, C=X secondary, V=Y context, Q/E=L/R, Enter=Start, Backspace=Select');
A(Object.values(KEYMAP).every(a => ACTIONS.includes(a)), 'every keyboard action is in the controller vocabulary (site/gamepad.js ACTIONS)');
A(['Escape', 'Tab', 'Space', 'Digit1', 'KeyP', 'Backquote', 'ShiftLeft', 'KeyR'].every(c => actionForKey(ev(c, '')) === null), 'Esc, Tab, Space, digits, P, R, ` and Shift are NOT actions (they keep their own meaning)');
A(actionForKey(ev('KeyW', 'W', { shiftKey: true })) === 'up' && actionForKey(ev('KeyD', 'D')) === 'right', 'Shift / Caps Lock (an uppercase e.key) still map by the physical key');
A(actionForKey(ev('KeyW', 'z')) === 'up' && actionForKey(ev('KeyZ', 'y')) === 'confirm', 'a non-QWERTY layout maps by position (e.code), not by the printed letter');
A(actionForKey(ev('KeyC', 'c', { ctrlKey: true })) === null && actionForKey(ev('KeyW', 'w', { metaKey: true })) === null && actionForKey(ev('ArrowLeft', 'ArrowLeft', { altKey: true })) === null,
	'modifier chords (Ctrl+C copy, Cmd+W, Alt+← back) are never actions');
A(actionForKey({ key: 'S' }) === 'down' && actionForKey({ key: 'ArrowUp' }) === 'up', 'an event with no code falls back to e.key, case-insensitively');
A(keyLabel('confirm') === 'Z' && keyLabel('secondary') === 'C' && keyLabel('menu') === 'Enter', 'key labels for hint bars');

// ---------- the typing guard ----------
A(isTyping(el('INPUT', { type: 'text' })) && isTyping(el('INPUT', { type: 'search' })) && isTyping(el('INPUT', { type: '' })) && isTyping(el('INPUT', { type: 'number' })), 'text-like inputs are typing');
A(isTyping(el('TEXTAREA')) && isTyping(el('SELECT')) && isTyping(el('INPUT', { type: 'range' })), 'textareas, dropdowns and sliders are typing');
A(isTyping(el('DIV', { isContentEditable: true })) && isTyping(el('BUTTON', { inOsk: true })), 'contenteditable and the on-screen keyboard are typing');
A(!isTyping(el('INPUT', { type: 'checkbox' })) && !isTyping(el('INPUT', { type: 'radio' })) && !isTyping(el('BUTTON')) && !isTyping(el('A')) && !isTyping(null), 'checkboxes, radios, buttons and links are NOT typing');

// ---------- the keyboard core ----------
function rig(opts = {}) {
	const log = [];
	let typing = false;
	const kb = createKeyboard({
		isTyping: () => typing,
		onPress: (a, i) => { log.push(`${i.repeat ? 'repeat' : 'press'}:${a}`); return true; },
		onRelease: (a, i) => log.push(`${i.forced ? 'forced' : 'release'}:${a}`),
		...opts,
	});
	return { kb, log, take: () => log.splice(0), setTyping: v => { typing = v; } };
}
{
	const r = rig();
	A(r.kb.keydown(ev('KeyZ', 'z')) === true && r.take().join() === 'press:confirm', 'Z presses confirm (and reports it handled)');
	A(r.kb.held('confirm'), '...and reads as held');
	r.kb.keydown(ev('KeyZ', 'z', { repeat: true }));
	A(r.take().length === 0, 'OS auto-repeat of a non-direction is swallowed (one press per press, like the pad)');
	r.kb.keyup(ev('KeyZ', 'z'));
	A(r.take().join() === 'release:confirm' && !r.kb.held('confirm'), 'letting go releases it');
	r.kb.keydown(ev('KeyS', 's')); r.kb.keydown(ev('KeyS', 's', { repeat: true }));
	A(r.take().join() === 'press:down,repeat:down', 'a held direction repeats (menus scroll)');
	r.kb.keyup(ev('KeyS', 's')); r.take();
}
{
	// THE Shift bug (audit §7): W pressed, Shift pressed, W released as "W" — must still let go
	const r = rig();
	r.kb.keydown(ev('KeyW', 'w'));
	r.kb.keyup(ev('KeyW', 'W', { shiftKey: true }));
	A(!r.kb.held('up') && r.take().join() === 'press:up,release:up', 'releasing W while Shift is held lets go of up (no stuck walk)');
	r.kb.keydown(ev('KeyW', 'W', { shiftKey: true }));
	A(r.kb.held('up') && r.take().join() === 'press:up', 'Shift+W still presses up (run + move)');
	r.kb.keyup(ev('KeyW', 'w')); r.take();
}
{
	// two keys on one action: letting go of the OTHER key doesn't release it
	const r = rig();
	r.kb.keydown(ev('ArrowUp', 'ArrowUp')); r.kb.keydown(ev('KeyW', 'w'));
	r.kb.keyup(ev('KeyW', 'w'));
	A(r.kb.held('up'), 'up held on ↑ survives a W keyup (only the key that pressed it releases it)');
	r.kb.keyup(ev('ArrowUp', 'ArrowUp'));
	A(!r.kb.held('up'), '...and ↑ keyup releases it');
	r.take();
}
{
	const r = rig();
	r.kb.keydown(ev('KeyA', 'a')); r.kb.keydown(ev('KeyD', 'd'));
	A(r.kb.direction() === 'right', 'direction() is the most recently pressed held direction');
	r.kb.keyup(ev('KeyD', 'd'));
	A(r.kb.direction() === 'left', '...and falls back to the one still held');
	r.kb.releaseAll();
	A(r.take().slice(-1)[0] === 'forced:left' && r.kb.direction() === null, 'releaseAll (blur / hidden tab) forces a release');
}
{
	const r = rig();
	r.setTyping(true);
	A(r.kb.keydown(ev('KeyW', 'w')) === false && r.kb.keydown(ev('KeyZ', 'z')) === false && r.take().length === 0, 'typing in a field: no key becomes an action');
	r.setTyping(false);
	A(r.kb.keydown(ev('KeyZ', 'z', { isTrusted: false })) === false && r.take().length === 0, 'a synthetic (untrusted) key event is ignored (no loops with replayed keys)');
	A(r.kb.keydown(ev('KeyC', 'c', { ctrlKey: true })) === false, 'Ctrl+C is left to the browser');
}
{
	const r = rig({ own: ['KeyE', 'r'] });
	A(r.kb.keydown(ev('KeyE', 'e')) === false && r.take().length === 0, 'an owned key (by e.code) is left to the surface');
	const undo = r.kb.own(['KeyQ']);
	A(r.kb.keydown(ev('KeyQ', 'q')) === false, 'own() claims more keys at runtime');
	undo();
	A(r.kb.keydown(ev('KeyQ', 'q')) === true && r.take().join() === 'press:prev', '...and its undo gives them back');
}
{
	// handled vs not: the browser default (page scroll on ↓) stays unless the handler took it
	const kb = createKeyboard({ isTyping: () => false, onPress: () => false });
	A(kb.keydown(ev('ArrowDown', 'ArrowDown')) === false, 'an action nobody handled reports false (the default action is kept)');
}

// ---------- suspend (an overlay takes the input) ----------
{
	const r = rig();
	const x = rig({ exclusive: true });
	// register both with the shared suspend registry the way startInput does
	globalThis.__mpInputSuspend.boards.add(r.kb);
	r.kb.keydown(ev('KeyD', 'd')); r.take();
	const resume = suspendInput('switcher');
	A(inputSuspended() && padsPaused(), 'suspendInput pauses the keyboard AND the pads');
	A(r.take().join() === 'forced:right', 'suspending forces a release of what the game held (no walking on behind the overlay)');
	A(r.kb.keydown(ev('KeyZ', 'z')) === false && r.take().length === 0, 'while suspended, keys reach no game');
	A(x.kb.keydown(ev('KeyZ', 'z')) === true && x.take().join() === 'press:confirm', '...but the exclusive (overlay) keyboard still works');
	resume(); resume();
	A(!inputSuspended() && !padsPaused(), 'resuming (twice is harmless) lifts both');
	A(r.kb.keydown(ev('KeyZ', 'z')) === true, 'the game hears keys again');
	globalThis.__mpInputSuspend.boards.delete(r.kb);
}

// ---------- the pad pause flag ----------
{
	const pad = { id: 'Pro Controller 057e', index: 0, connected: true, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
	const set = (i, on) => { pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
	const log = [], xlog = [];
	const game = createGamepad({ readPads: () => [pad], onPress: a => log.push('press:' + a), onRelease: (a, i) => log.push((i.forced ? 'forced:' : 'release:') + a) });
	const overlay = createGamepad({ readPads: () => [pad], exclusive: true, onPress: a => xlog.push('press:' + a) });
	set(13, true); game.poll(0); overlay.poll(0);
	A(log.join() === 'press:down', 'the game hears the d-pad');
	log.length = 0; xlog.length = 0;
	const unpause = pausePads('switcher');
	game.poll(16); overlay.poll(16);
	A(log.join() === 'forced:down' && !game.held('down'), 'paused: the game\'s held direction is force-released');
	set(13, false); set(1, true); game.poll(32); overlay.poll(32);
	A(log.length === 1 && xlog.join() === 'press:confirm', 'paused: the game hears nothing, the exclusive overlay poller still does');
	set(1, true); unpause(); game.poll(48);
	A(log.length === 1, 'unpaused with A still down: it must be let go first (latched), so closing the overlay never fires the game');
	set(1, false); game.poll(64); set(1, true); game.poll(80);
	A(log.slice(-1)[0] === 'press:confirm', '...a fresh press works');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
