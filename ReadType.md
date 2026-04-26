## What `ReadType` should do

### 1. Map spec readers to runtime values
- If the spec is a reader type (`TypeReaderT<T>`), `ReadType<T>` should be `T`.
- If the spec is an object with named fields, it should become an object whose keys are the spec keys and whose values are `ReadType` of each field.
- If the spec is a tuple/array, it should become the corresponding tuple/array of `ReadType` values.
- `undefined` remains `undefined`.

### 2. Flatten `bin.Merge` payloads into the containing object
- `bin.Merge(...)` is purely a type-level flattening operation.
- The fields inside a `Merge` payload should be spliced directly into the containing object type.
- `Merge` does not create a separate runtime field; it only affects the containing object.
- If a merged payload defines a field that already exists, the resulting field type may widen to include both possibilities.
- Example:
  - `x: bin.UINT8`
  - `y: bin.Merge({ a: bin.UINT16_LE })`
  - result should be `{ x: number; a: number }`.
- There should be no runtime or result-level `merge` property.

### 3. Make union and correlated union behavior implicit
- Conditional combinators like `bin.If` and `bin.Switch` should work by composing normal object specs.
- Each branch result is a normal object type, and branch unions should be derived automatically from those object shapes.
- If a branch-specific field appears only in one branch, the resulting union should make it optional.
- For `bin.Switch` with a discriminator, the result should be a discriminated union with full correlation preserved by the branch object shapes.

### 4. Treat `CorrelatedMerge` as a type-only wrapper
- `CorrelatedMerge` exists to preserve branch correlation during type computation.
- Its payload should still be flattened into branch object fields, not left as a runtime `merge` wrapper.
- The resulting discriminated union should expose the branch fields directly.

### 5. Do not require a top-level `merge` property
- `ReadType` should produce the merged object fields themselves.
- Users should not need to access `.merge`.
- Internal helper wrappers should be erased by the final `ReadType` result.

### What this implies for helper types
- `AllMerged<T>` should compute the merged field payloads from `bin.Merge` readers.
- `NonMerged<T>` should compute the normal object fields, excluding merge readers.
- `MergeResult<NonMerged<T>, AllMerged<T>>` should combine both into the final object shape.
- Correlated union preservation should arise from normal branch typing, not from a separate `merge` wrapper.

### Examples

#### Merge
```ts
const spec = {
  header: bin.UINT8,
  body: bin.Merge({
    a: bin.UINT16_LE,
    b: bin.UINT16_LE,
  }),
};
type Result = bin.ReadType<typeof spec>;
// Result = { header: number; a: number; b: number; }
```

#### If
```ts
const spec = {
  type: bin.UINT8,
  _: bin.If(s => s.obj.type === 1, {
    x: bin.UINT8,
  }, {
    y: bin.UINT8,
  }),
};
type Result = bin.ReadType<typeof spec>;
// Result = { type: number } & ({ x: number } | { y: number })
```

#### Switch
```ts
const spec = {
  type: bin.String(1),
  _: bin.Switch('type', {
    a: { value: bin.UINT8 },
    b: { flag: bin.UINT8 },
    default: {},
  }),
};
type Result = bin.ReadType<typeof spec>;
// Result =
//   | { type: 'a'; value: number }
//   | { type: 'b'; flag: number }
//   | { type: string }
```
