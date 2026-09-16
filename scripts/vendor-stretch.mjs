// Copies the Signalsmith Stretch ES module (MIT) into public/vendor, unbundled.
// It must not go through the bundler: the library turns its own functions into
// source text and runs that inside an AudioWorklet, and the bundled copy never
// starts there (verified 2026-09-14: bundled, the node timed out; the same file
// loaded unbundled was ready in about 10 ms). lib/audio.ts imports this file at
// runtime with a webpackIgnore comment.
// Run after upgrading the package, then bump STRETCH_URL's ?v= in lib/audio.ts.
// The script fails loudly if the patched loop below no longer matches.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("node_modules/signalsmith-stretch/package.json", "utf8"));
const source = readFileSync("node_modules/signalsmith-stretch/SignalsmithStretch.mjs", "utf8");
// Patch: streaming across many appended buffers. In 1.3.2 the worklet's copy
// loop advances `audioSamples` by the samples it copied instead of to the next
// buffer's start, and never advances `inputSamples`. With one big buffer that
// is harmless; with a stream of small chunks (Gemini sends ~40 ms of audio at
// a time) the offsets drift, the copy overruns its window, `set` throws, and
// the AudioWorklet dies silently. The fix moves `inputSamples` forward by what
// was copied and `audioSamples` to the end of each buffer (the loop already
// computes `bufferEnd` for this). Verified 2026-09-14 against 40 ms chunks.
const LOOP = /(buffer\.subarray\(blockSamples\)\.set\(channelBuffer\.subarray\(startIndex, startIndex \+ count\)\);\s*\}\);\s*)audioSamples \+= count;(\s*)blockSamples \+= count;(\s*)\} else \{ \/\/ we're already past this buffer - skip it\s*audioSamples \+= audioBuffer\[0\]\.length;(\s*)\}/g;
const matches = source.match(LOOP);
if (!matches || matches.length !== 1) {
  throw new Error(`signalsmith-stretch ${pkg.version}: expected the buffer copy loop once, found ${matches ? matches.length : 0}. Re-check the patch before upgrading.`);
}
const patched = source.replace(LOOP, "$1inputSamples += count;$2blockSamples += count;$3}$4// Chalk patch (scripts/vendor-stretch.mjs): continue at the next buffer's start.$4audioSamples = bufferEnd;");

const header = `/*! signalsmith-stretch ${pkg.version} | ${pkg.license} License | ${pkg.author} | https://signalsmith-audio.co.uk/code/stretch/ | patched for streaming, see scripts/vendor-stretch.mjs in tutor-app */\n`;
mkdirSync("public/vendor", { recursive: true });
writeFileSync("public/vendor/signalsmith-stretch.mjs", header + patched);
console.log(`public/vendor/signalsmith-stretch.mjs <- signalsmith-stretch ${pkg.version} (patched)`);
