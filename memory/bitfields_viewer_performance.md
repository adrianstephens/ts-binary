---
name: bitfields-viewer-performance
description: "Why typedArray.BitFields block views were ~80x slower than hand-written decoding, the three fixes (byte-array views, arithmetic float valueOf, class-based block view), the getter mask bug found on the way, and how to measure"
metadata:
  node_type: memory
  type: project
---

Found while replacing hand-written GGUF quantisation decoders in `binary-ml/src/gguf.ts` with descriptive block layouts. Decoding 1M Q4_K elements through `bin.typedArray.BitFields` block views took ~80 ms against ~1 ms hand-written.

**Causes** (all in the read path of `BitFieldsViewer`):
- Every array field access built a `new Proxy`, and each `q[j]` went through a `get` trap that parsed the string key. Arrays of bytes are by far the commonest case.
- Float fields (`float16` etc.) converted with `valueOf` through `float64.pack(splitAdjust(bits.to(raw)))`: a BigInt round trip, ~225 ns per field.
- A block view was `Object.create(proto)` plus two `Object.defineProperty` calls, ~200 ns.

**Fixes** (`src/utilities/bitfields.ts`, `float.ts`): byte-aligned `Array(n, 8)` / `Array(n, -8)` fields are returned as `Uint8Array` / `Int8Array` views (write-through, no proxy; other arrays still proxies); `valueOf` for formats up to 32 bits is plain arithmetic with the BigInt path kept for Inf, NaN and the noInf/noNeg0 variants; block views are instances of a class per descriptor with private `#dv` / `#offset`. Result: descriptive Q4_K decode ~1.6 ms vs ~0.9 ms hand-written. Sub-byte arrays such as `Array(32, 4)` are still proxies, so describe ggml-style blocks with byte arrays and do the nibble arithmetic in the decoder.

**Bug fixed on the way**: in `bitsView`'s fixed-offset path, `get` shifted and then applied the already-shifted mask, so any field not starting on a byte boundary (e.g. the high nibble) read as 0 when read through a typedArray/BitFields view. `set` was correct. Fixed by masking then shifting; regression test in `test/test.ts`.

**How to measure**: a fair comparison hoists each field once per block (`const q = x.qs`), times both decoders in one harness, and avoids feeding one decoder function different array types (deoptimises it and inflates the second run).

**Known gaps noticed, not fixed**: `BitOutput<-8>` (a signed width) resolves to `never`, so signed array elements can't be assigned without a cast; `npm run lint` fails because `eslint.config.mjs` uses the flat-config-incompatible `ignorePatterns`; `test/test-bits.ts` "LE sync: WithBits + Size substream bounds" fails (predates these changes).
