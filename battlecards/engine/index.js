// engine/index.js -- the canonical engine facade (docs/05, PR 15).
// core.js re-exports every extracted module's public surface, so one
// wildcard covers the whole 98-export API with unchanged names/signatures.
// New out-of-band setup APIs (PR 15) surface here too.
export * from './core.js';
export * from './setup.js';
