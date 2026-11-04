// trickhouse5b_test.mjs — part B of trickhouse5_test.mjs (dolls 4-5, the full
// real-key run, the reward, reload + server sync). The suite is split so each
// part fits the gate's 5-minute limit; see trickhouse5_test.mjs.
//
//   node overworld/tests/trickhouse5b_test.mjs
process.env.P5_PART = 'B';
await import('./trickhouse5_test.mjs');
