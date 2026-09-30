---
name: binary-package-bugs-found
description: "Two real correctness bugs found and fixed in @isopodlabs/binary's core types.ts (ULEB128.put(0), Size's variable-width length placeholder) while building binary-libs/wasm.ts -- affects every consumer (elf.ts, pe.ts, mach.ts, cvinfo.ts, ...), not just wasm"
metadata: 
  node_type: memory
  type: project
  modified: 2026-07-26T07:44:54.584Z
  originSessionId: f04273b7-1564-4fa5-9495-83f91e965b72
---

## Why these matter beyond wasm.ts

Found while building [[binary_wasm_module]] (a heavy, first real stress-test of `ULEB128`/`Size` with genuinely variable-length, dynamically-sized content) -- both are pre-existing bugs in `binary/src/types.ts` itself, not in the new wasm code. They're latent in every other format module too (`elf.ts`/`pe.ts`/`mach.ts`/`cvinfo.ts`/`CompoundDocument.ts`), just never triggered: those mostly use fixed-width length fields (`UINT32_LE` etc.), and none of them happened to `ULEB128`-encode a literal `0`. Both fixed at the source (`binary/src/types.ts`), with new regression tests added to `binary/test/test.ts` (37 -> 38, 38 -> confirmed passing after both fixes).

## Bug 1: `ULEB128.put(s, 0)` wrote zero bytes instead of one

`highestSetIndex(0) === -1` (no bit is set) fed into `new Uint8Array(Math.floor(highestSetIndex(v) / 7) + 1)` -- `Math.floor(-1/7)+1 = 0`, sizing the output buffer to *zero* bytes for the specific value `0`. The subsequent `buffer[i++] = Number(v)` silently no-ops (TypedArray out-of-bounds writes are no-ops in JS, no error), so `ULEB128.put(s, 0)` encoded nothing at all. Confirmed directly: `bin.write(s, bin.ULEB128, 0)` then `s.terminate()` returned an empty array.

Symptom in practice: any `Size`-wrapped/vec-count/index field that happened to be `0` desynced everything written after it by one byte (e.g. a wasm type section's "0 supertypes" or a genuinely empty vec). Fix: `Math.max(1, Math.floor(highestSetIndex(v) / 7) + 1)` -- one clamp, one line.

## Bug 2: `Size.put` corrupted content when the length field's own width changed

`Size(len, type)`'s old `put` wrote a placeholder length (`x.put(s, 0)`), wrote content into an offset substream, measured it, then seeked back and **patched the placeholder in place** with the real length. This silently assumes the placeholder's byte-width and the real length's byte-width are the same -- true for a fixed-width `len` type (`UINT32_LE` etc, the common case elsewhere in this codebase), **false** whenever `len` is itself variable-width (`ULEB128`) and the real length needs more bytes to encode than `0` did (i.e. content >= 128 bytes, a 1-byte -> 2-byte ULEB128 crossing). The wider patch then overwrote however many content bytes physically sat in that gap -- confirmed directly: writing 200 bytes of `0x41` via `Size(ULEB128, RemainingBuffer())` produced a correctly-*sized* 202-byte output (so a naive "does the length look right" check wouldn't catch it) but the content bytes themselves were corrupted (not all `0x41` anymore).

This is exactly the bug behind `TStoWasm`'s class/GC test failing with `WebAssembly.Module(): function body count 29 mismatch (8 expected)` -- Point/Rect's combined code section legitimately exceeded 127 bytes, tripping this for the first time anywhere in this codebase.

Fix, in `Size.put`: stopped doing placeholder-then-patch entirely. Precompute the exact length up front via `measure(type, v)` (a `dummyStream`-based measuring pass -- the same trick `Measured()` already used elsewhere in `types.ts`, just not previously wired into `Size` itself), then write the length once (now known-correct) followed by content, no seek-back/patch step at all. Cost: one extra synchronous dummy-write pass per `Size`-wrapped value; eliminates the whole width-mismatch bug category rather than special-casing it.

**Scope note**: the fix is sync-only (`measure()` is built on `dummyStream` from `sync.ts`). Consistent with `Measured()`'s own pre-existing scope and with every other current `Size` consumer in this codebase (all sync-only); flagged in case a genuinely async `Size` use case ever surfaces and needs revisiting.

## Methodology note

Both found by *executing* real output (Node's native `WebAssembly.Module` for bug 2, direct byte-array inspection for both) rather than trusting that "the length looks about right" -- bug 2 specifically produces a length prefix that reads back structurally plausible (right total byte count) while the content itself is silently wrong, which a shallow check (or a test asserting only `.length`, as an early draft of the wasm.ts test did) would have missed entirely. Matches [[tison_debugging_technique]]/[[feedback_verify_before_fallback]]'s general pattern: verify against real execution/real bytes, not "should be fine" reasoning.

## Bug 3 (2026-09-30): `Size.put`'s measuring pass ran with no enclosing object

Bug 2's fix measured on a fresh `dummyStream`, so a writer inside the `Size` that reads its context (`s.obj`) saw
`undefined`. zip's extra field (`makeExtra(s.obj)`) crashed on every write. Fix: `measure(type, data, context)`
builds its `dummyStream` with the context's `be` and `obj`, and `Size.put` passes `s`.

## Bug 4 (2026-09-30): `Merge` overwrote parent fields with `undefined`

`Merge.get` did `Object.assign(s.obj, value)`, so an absent `Optional` inside it erased the field it merges over (zip's
ZIP64 extra clobbered the header's real sizes/offset with `undefined` -> NaN). Now merges key by key through `merge()`,
which already skipped `undefined`. Found reading lib3mf's always-ZIP64 3MF files via binary-archives.

## Transform (2026-09-30): accessor in an inlined type literal

`scripts/transform.ts` crashed ("Lexical environment is suspended") when a declaration inlined `float3` (an inferred
return type): `visitEachChild` on a get accessor starts a body environment. All type passes now go through
`visitChildren`, which visits an accessor's parameters/type only. binary-bitmaps' .d.ts output was byte-identical.

`test-bits.js` "LE sync: WithBits + Size substream bounds" (3 !== 0) fails with or without Bug 3's fix -- pre-existing.
