---
name: binary-package-flags-dts-union-bug
description: "Root-caused + fixed why binary-libs' generated .d.ts (pe.d.ts DllCharacteristics, elf.d.ts p_flags, etc) showed a spurious duplicated union type for every bin.Flags()-typed field; fixed in @isopodlabs/binary's Flags(), not the caller files"
metadata: 
  node_type: memory
  type: project
  originSessionId: 52b95c3a-87c2-4791-b040-376d3654bf89
  modified: 2026-07-30T23:03:30.314Z
---

## Symptom

Every field built via `bin.as(baseType, bin.Flags(ENUM_OBJ))` (e.g. `pe.ts` `DllCharacteristics`, `elf.ts` `p_flags`) showed a duplicated near-identical union in the generated `.d.ts`: `(Partial<{}> & {...8 keys...}) | {...same 8 keys...}` instead of one clean object type.

## Root cause

Not a bug in `binary/scripts/transform.ts` (verified by rebuilding with the plugin removed from tsconfig — identical duplicate union still appeared) and not specific to `pe.ts`'s `Switch('Magic', {NT32:{...}, NT64:{...}})` branching (reproduced in an isolated 10-line file with no Switch at all).

Real cause: `bin.as<T,D>(type, maker: adapter0<T,D,O>)` in `binary/src/types.ts` infers its single type parameter `D` from *both* `to(x:T,opt):D` (covariant) and `from(x:D,opt):T` (contravariant) on the same `maker` object. `Flags()`'s returned object (`binary/src/index.ts`) had `to(x): FlagsObject<E,NoFalse>` (resolves to `FlagsObject<E,true>`) but a deliberately wider `from(x: FlagsObject<E,true> | FlagsObject<E,false>)` — so TS unions the covariant and contravariant candidates into `FlagsObject<E,true> | FlagsObject<E,false>`, which is exactly the two printed branches (`Partial<{}> & {...}` = true-branch, plain `{...}` = false-branch).

Secondary/cosmetic layer: fields print as `number` instead of `true`/`boolean` when the flags enum object isn't declared `as const` (e.g. `DLLCHARACTERISTICS` in pe.ts) — widens values to `number`, defeating `FlagsObject`'s `IsPow2<E[K]>` check. Compare `elf.ts`'s `PF` (is `as const`) whose `p_flags` union correctly showed `true`/`boolean` for the pow2 members.

## Fix

Narrowed `Flags().from()`'s parameter type in `binary/src/index.ts` to `FlagsObject<E, NoFalse>` (matching `to`'s return exactly) instead of the `true|false` union — runtime body (`if (v) ...`) behaves identically either way. User applied and confirmed working, 2026-07-30. Fixes it for every consumer at once (elf.ts, mach.ts, clr.ts, pe.ts), same "fix once in binary/, not per-caller" shape as [[binary_package_bugs_found]].

## Methodology note

When a generated `.d.ts` union looks spurious/duplicated, don't assume the declaration-transform plugin (`transform.ts`) did it — rebuild with `plugins` stripped from tsconfig to get a vanilla-tsc baseline first. Also try to shrink to the smallest possible repro (isolated file importing just the suspect helper) before reasoning about the actual call site's surrounding structure (Switch/class nesting here was a total red herring).
