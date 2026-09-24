// eslint.undef.config.mjs — the main.js split's safety net (Plans/MAIN_JS_SPLIT_PLAN.md).
//
// An ES module that uses a name it no longer declares or imports only throws
// ReferenceError when that code path RUNS, so moving code out of main.js can pass
// every test and still break a rarely-hit branch. `no-undef` over every overworld
// module catches it statically, and overworld/tests/undef_test.mjs runs this in the gate.
//
// Browser globals are allowed, EXCEPT the easily-confused ones. main.js has its
// own `screen` (the canvas); moved without its import it would silently become
// window.screen. Removing these makes every bare use resolve to a real binding.
//
//   npx eslint -c tools/eslint.undef.config.mjs "overworld/*.js"
import globals from 'globals';

const CONFUSABLE = ['screen', 'name', 'status', 'event', 'top', 'parent', 'length', 'origin',
	'close', 'closed', 'open', 'opener', 'print', 'self', 'history', 'frames', 'stop', 'find', 'external'];
const browser = { ...globals.browser };
for (const k of CONFUSABLE) delete browser[k];

export default [{
	files: ['overworld/*.js'],
	languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: browser },
	linterOptions: { reportUnusedDisableDirectives: 'off' },
	rules: { 'no-undef': 'error' },
}];
