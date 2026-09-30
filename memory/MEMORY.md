## @isopodlabs/binary

- [binary package bugs found](binary_package_bugs_found.md) — fixes in `types.ts`/`sync.ts` (ULEB128.put(0), Size placeholder, Size measuring without context, Merge clobbering with undefined) and the d.ts transform's accessor crash
- [Flags .d.ts union bug](binary_package_flags_dts_union_bug.md) — spurious duplicated union in generated `.d.ts`, fixed in `Flags()` at source
- [binary API friction notes](binary_api_friction_notes.md) — `binary-libs/wasm.ts` used as a deliberate stress test of this package; running friction log
- [bitfields viewer performance](bitfields_viewer_performance.md) — why block views were ~80x slower than hand-written decoding, the three fixes, and a nibble-offset `get` bug fixed on the way

---

*Migrated out of the global auto-memory store on 2026-09-09 so these memories travel with the repo.*
