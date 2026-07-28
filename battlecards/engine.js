// engine.js -- compatibility shim (docs/engine-hardening/05, PR 15).
// The engine body lives in engine/core.js and the module tree under engine/;
// engine/index.js is the canonical facade. Every existing importer (game.js,
// ai.js, tests) keeps its `import * as E from './engine.js'` line unchanged.
export * from './engine/index.js';
