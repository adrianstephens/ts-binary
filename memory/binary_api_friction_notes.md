---
name: binary-api-friction-notes
description: "binary-libs/wasm.ts is being used deliberately as a stress test of the WIP @isopodlabs/binary package itself; running friction-notes doc tracks surprising-but-correct API behavior, may inform API changes"
metadata: 
  node_type: memory
  type: project
  originSessionId: f04273b7-1564-4fa5-9495-83f91e965b72
  modified: 2026-07-27T02:24:18.515Z
---

The `@isopodlabs/binary` package is a work in progress. [[binary_wasm_module]] (the wasm.ts reader/
writer) isn't just being built for its own sake -- the user is deliberately using it to thoroughly
exercise `binary` and find where it's deficient. A recurring theme the user named explicitly
(2026-07-27): the hardest recurring problem isn't bugs, it's *explaining how to use the library* --
correct-but-surprising behavior that isn't discoverable from signatures alone.

**Why this matters**: don't treat friction found in wasm.ts as one-off wasm.ts problems to route
around locally -- they're candidate signals for changing `binary`'s own API/docs. Flag new ones as
they come up rather than quietly working around them.

**Running log**: `assistant/binary-package-api-notes.md` (repo root) -- update it whenever a new
"worked as designed, design wasn't discoverable" moment turns up while continuing this work. Current
entries (as of 2026-07-27): `Switch`'s default discriminator silently degrading on structurally-
identical branches (every instruction wrote as opcode 0x00 unreachable, no error); `ReadType`'s
merge-collapse for `Switch` branches with overlapping field names (intentional for `WasmSpec`'s
section table, but also fires unwanted -- `TableType` got a confusing error, `mapTable`'s branches
went missing from `Instr` with *no* error at all); `as`'s `from` silently defaulting to identity
when omitted; `Merge`'s `_` runtime artifact (type-level flattening, real stray key at runtime);
method-shorthand bivariance on `TypeT.put` masking a real spec/interface drift (`TableType.init`).

See also [[binary_package_bugs_found]] (two actual bugs, not just friction, found via the same
stress-testing effort) and [[binary_wasm_module]] (the wasm.ts file itself, its own design notes).
