  bbn# @isopodlabs/binary
[![npm version](https://img.shields.io/npm/v/@isopodlabs/binary.svg)](https://www.npmjs.com/package/@isopodlabs/binary)
[![GitHub stars](https://img.shields.io/github/stars/adrianstephens/binary.svg?style=social)](https://github.com/adrianstephens/binary)
[![License](https://img.shields.io/npm/l/@isopodlabs/binary.svg)](LICENSE.txt)

This package provides a set of utilities for reading and writing binary data in TypeScript.

## ☕ Support My Work  
If you use this package, consider [buying me a cup of tea](https://coff.ee/adrianstephens) to support future updates!  

## Usage

Here is a basic example of how to use the package:

```typescript
import * as binary from '@isopodlabs/binary';

// Define an object to specify how to read a structure, e.g.
const StructSpec = {
    x:  binary.UINT16_LE, // read 16-bit little-endian
    y:  binary.StringType(binary.UINT8, 'utf8') // reads an 8 bit length, and reads a string of that length
};

// Create a new stream from a Uint8Array
const stream = new binary.stream(data);

// Read data from the stream
const myData = binary.read(stream, StructSpec);

// The data should look like {x: 42, y: "Something"}
console.log(myData);

// Create a new stream for output
const stream2 = new binary.growingStream;

// Write data back to a stream
binary.write(stream2, StructSpec, myData);

// Extract written data as a Uint8Array
const data2 = stream2.terminate();
```

**Interfaces**:

- `_stream`: Base interface for stream handling.
  - `stream`: Main implementation of _stream.
  - `growingStream`: Allows the buffer to grow.
- `TypeT`: A single serialisation definition, with:
  - `get(s: _stream): T;`
  -	`put(s: _stream, v: T): void;`
- `Type`: Specifies how/what to read/write. One of:
  - a `TypeT`.
  - an object consisting of properties that are `Type`s
  - an array whose elements are `Type`s
- `TypeX`: Used to provide things like lengths for strings or arrays. One of:
  - a `Type`: the value will be read/written as usual
  - a function `(s: _stream, value?: T)=>T`: the value will be the result of calling the function
  - a constant: the value is specified directly.

**Functions**:

- `read(stream, type)`: Read from a stream.
- `write(stream, type, value)`: Write a value to a stream.
- `Class(spec)`: Generate a class based on a type spec.
- `Extend(base, spec)`: Generate a class based on a base class and a type spec.

## Built-in Types

Note that in the following, `type` is an instance of a `Type`, and that parameters `len`, `offset`, and `test` are `TypeX`s.
Where needed, `be` indicates endianness; when not specified, the `be` property of the stream is used.

### Numeric

- `UINT(n, be?)`: unsigned n-bit integer (n must be a multiple of 8).
- `INT(n, be?)`: signed n-bit (n must be a multiple of 8).
- `Float(m, e, eb?, s?, be?)`: float with m mantissa bits, e exponent bits, eb exponent bias, and optional sign bit.
- `FloatRaw(m, e, eb?, s?, be?)`: as above, but read/written to packed fields instead of a number.

The following are pre-defined constants; in addition, each can be suffixed with `_LE` or `_BE` for explicitly little- and big-endian types.
- `UINT8`:  8-bit unsigned integer.
- `INT8`:  8-bit signed integer.
- `UINT16`: 16-bit unsigned integer.
- `INT16`: 16-bit signed integer.
- `UINT32`: 32-bit unsigned integer.
- `INT32`: 32-bit signed integer.
- `UINT64`: 64-bit unsigned integer.
- `INT64`: 64-bit signed integer.
- `Float32`: 32-bit floating-point number.
- `Float64`: 64-bit floating-point number.


Others:
- `ULEB128`: Read an unsigned LEB128 (Little Endian Base 128) integer.

### Strings

- `StringType(len, encoding?, zeroTerminated?, lenScale?)`: A string of length `len` and given `encoding`.
- `RemainingStringType(encoding?, zeroTerminated?)`: Read the remainder of the stream into a string.
- `NullTerminatedStringType`: Read a string up to the first 0, and append a zero when writing.

### Arrays

- `ArrayType(len, type)`: An array of length `len` using the given `type`.
- `RemainingArrayType(type)`: Read the remainder of the stream into an array of the given `type`.


### Conditional/Branching

Since `test` is a `TypeX`, the test can be dynamically determined from a token in the stream or any arbitrary function. When writing these types, by default the value of `test` will be determined by trying to match the value to each possible type. It is possible to override this by passing an additional discriminator function.

- `Optional(test, type, discrim?)`: If `test` is truthy, reads `type`.
- `If(test, true_type, false_type?, discrim?)`: Evaluates `test` and reads either `true_type` or `false_type`. The result is merged into the enclosing object.
- `Switch(test, switches, discrim?)`: Reads one of the types in `switch` based on the result of `test`.

### Others

- `Struct(spec)`: A structured object. Not strictly necessary because any non-reader object is interpreted this way anyway.
- `StructT(spec)`: Strongly-typed struct helper when you want explicit type control.
- `Remainder`: Read the remainder of the stream into a `Uint8Array`.
- `Buffer(len, view?)`: A buffer of length `len`, returned as a `view`, which defaults to Uint8Array.
- `SkipType(len)`: Skip `len` bytes in the stream.
- `DontRead<T>()`: Do not read or write the specified `type` - used to create a placeholder property in an object.
- `AlignType(align)`: Align the stream to the specified alignment.
- `Discard(type)`: Read and then discard the specified `type`.
- `Expect(type, value)`: Asserts the read value equals an expected constant.
- `SizeType(len, type)`: Truncate the stream to `len` bytes, and read/write `type`.
- `OffsetType(offset, type)`: Start from `offset` bytes into the stream, and read/write `type`.
- `MaybeOffsetType(offset, type)`: As `OffsetType`, but returns `undefined` if the offset is 0.
- `Const(value)`: Returns a constant value.
- `Func(func)`: Returns a value from a custom function.
- `FuncType(func)`: Read a type that is returned by a custom function.


## TypeX

To illustrate the use of TypeX parameters, consider the following type 'spec':

```typescript
const spec = {
	len: bin.UINT16_LE,
	array_fixed: bin.ArrayType(4, {x: bin.Float32, y: bin.Float32}),
	array_prefixed: bin.ArrayType(bin.UINT16_LE, {x: bin.Float32, y: bin.Float32}),
	array_computed: bin.ArrayType(s => s.obj.len, {x: bin.Float32, y: bin.Float32}),
}
```
- Constant: when reading `array_fixed`, the length is simply the constant 4.
- Prefix: when reading `array_prefixed`, the length is read from the stream as a little-endian 16 bit unsigned integer.
- Functions: when reading `array_computed`, the length is obtained by calling the function.

 While an object-like `Type` is being serialised the stream temporarily holds a reference to read fields in its `obj` property. This allows `TypeX` functions to access already-serialised values, like `len`. When `obj` is created it stores the previous value in its own `obj` property, allowing access to parent structures.

## Transformations

Types can be transformed using `as`.

- `as(type, maker, from?)`: Read a type and transform it using a maker function and optional `from` mapping.

These are provided for use with `as`:

### Numerical
- `EnumV(e)`: Typed enum value helper.
- `Enum(e)`: Define an enumeration.
- `Flags(e, noFalse)`: Define a set of flags.
- `BitFields(bitfields)`: Define a set of bit fields.

### Arrays
- `arrayWithNames(type, func)`: Transform array to named tuples.
- `objectWithNames(type, func)`: Transform array into objects keyed by computed names.
- `field(name)` / `names(list)`: Convenience naming functions for `arrayWithNames` / `objectWithNames`.

### Predefined
These are predefined types that use `as`:

- `asHex(type)`: Transform to a hexadecimal string.
- `asInt(type, radix?)`: Transform to an integer with the specified radix.
- `asFixed(type, fracbits)`: Transform to a fixed-point number with the specified fractional bits.
- `asEnum(type, enum)`: Transform it to an enum value.
- `asFlags(type, enum, noFalse?)`: Transform to a flags value.


## Classes

### Class:
This function generates the following class from a provided `Type`.
```typescript
class X {
	<fields infered from type>
	static get(s: _stream): X;
	static put(s: _stream, v: X);
	constructor(s: _stream | {<fields infered from type>});
	write(s: _stream);
};
```
Simple use
```typescript
const Point = binary.Class({
  x: binary.Float32,
  y: binary.Float32,
});
```
Extending
```typescript
class CPoint extends binary.async.Class({
  x: binary.Float32,
  y: binary.Float32,
}) {
  //optional constructor for custom initialisation
  constructor(arg: {x: number, y: number} | bin._stream) {
    super(arg);
  }
}
```
### Extend:
This function allows for extending existing classes with properties provided by a `Type`. It generates the following class:
```typescript
class X extends B {
	<fields infered from type>
	static get(s: _stream);
	static put(s: _stream, v: X);
	constructor(s: _stream | {<B constructor parameters, <fields infered from type>});
	write(s: _stream);
};
```
## Async API

The package also exports `binary.async` for asynchronous stream backends.

**Interfaces**:

- `async._stream`: Base interface for stream handling.
  - `async.stream`: Main implementation of _stream.
- `async.TypeT`: A single serialisation definition, with:
  - `get(s: _stream): T;`
  -	`put(s: _stream, v: T): void;`

**Functions**:

- `async.read(stream, type)`: Read from a stream.
- `async.write(stream, type, value)`: Write a value to a stream.
- `async.Class(spec)`:
- `async.Extend(base, spec)`:

Since constructors can not be asynchronous, async classes can only be read using the class's static `get`.

```typescript
class Point extends binary.async.Class({
  x: binary.Float32,
  y: binary.Float32,
}) {
  z: number;
  constructor(data: {x: number; y: number}) {
    super(data);
    this.z = 42;
  }
}

const Curve = binary.async.Extend(Point, {
  flags: binary.INT8,
});

const curve = new Curve({x: 10, y: 20, flags: 1});
await curve.write(stream);

const curve2 = await Curve.get(stream);
```

## Utilities

The binary.utils namespace contains the following utilities:

### Constants

- `isLittleEndian`: Boolean indicating whether the system uses little-endian byte order.

### Bit Manipulation

- `isPow2(n)`: Returns true if `n` is a power of 2.
- `contiguousBits(n)`: Returns true if all set bits in `n` are contiguous.
- `lowestSet(n)`: Returns the value with only the lowest set bit of `n`.
- `highestSetIndex32(n)`: Returns the index (0-31) of the highest set bit in a 32-bit number.
- `highestSetIndex(n)`: Returns the index of the highest set bit in a number or bigint.
- `lowestSetIndex32(n)`: Returns the index (0-31) of the lowest set bit in a 32-bit number.
- `lowestSetIndex(n)`: Returns the index of the lowest set bit in a number or bigint.
- `clearLowest(n)`: Clears the lowest set bit in `n`.
- `bitCount32(n)`: Counts the number of set bits in a 32-bit number.
- `bitCount(n)`: Counts the number of set bits in a number or bigint.
- `splitBinary(n, splits)`: Splits bits from `n` into an array based on bit widths in `splits`.

### Integer Operations

These functions read and write arbitrarily sized integers from/to a DataView at a given offset. The non-big versions support 1-7 bytes (7 bytes may lose precision due to JavaScript number limitations).

- `getUint(dv, offset, len, littleEndian?)`: Read an unsigned integer of `len` bytes.
- `getInt(dv, offset, len, littleEndian?)`: Read a signed integer of `len` bytes.
- `putUint(dv, offset, v, len, littleEndian?)`: Write an unsigned integer `v` as `len` bytes.
- `getBigUint(dv, offset, len, littleEndian?)`: Read an unsigned bigint of `len` bytes.
- `getBigInt(dv, offset, len, littleEndian?)`: Read a signed bigint of `len` bytes.
- `putBigUint(dv, offset, v, len, littleEndian?)`: Write an unsigned bigint `v` as `len` bytes.

### Floating-Point Operations

- `Float(mbits, ebits, ebias?, sbit?)`: Creates a custom floating-point format with specified mantissa bits, exponent bits, exponent bias, and optional sign bit.

This function returns a `Float` interface for working with custom floating-point formats:

```typescript
interface Float {
	mbits: 		number;        // mantissa bits
	ebits: 		number;        // exponent bits
	exp_bias:	number;        // exponent bias
	sbit: 		boolean;       // has sign bit
	bits: 		number;        // total bits
	(value: number):	FloatInstance;                           // create from number
	raw(i: R):			FloatInstance;                           // create from raw bits
	parts(mantissa, exp, sign): FloatInstance;              // create from parts
}

interface FloatInstance {
	raw: number | bigint;                      // raw bit representation
	parts():	{mantissa, exp, sign};        // decompose to parts
	valueOf():	number;                        // convert to JavaScript number
	toString(): string;                        // string representation
}
```

Predefined formats:
- `float8_e4m3`: 8-bit float with 4 exponent and 3 mantissa bits
- `float8_e5m2`: 8-bit float with 5 exponent and 2 mantissa bits
- `float16`: IEEE 754 half precision (10 mantissa, 5 exponent)
### TypedArray Operations

Extended TypedArray interface with support for unaligned access, endianness control, arbitrary bit sizes, and custom float formats.

```typescript
interface TypedArray<R> {
	buffer:			ArrayBufferLike;
	length:			number;
	byteLength:		number;
	byteOffset:		number;
    [n: number]:	R;
	// Supports standard array methods: copyWithin, every, fill, filter, find,
	// findIndex, forEach, indexOf, join, lastIndexOf, map, reduce, reduceRight,
	// reverse, some, sort, etc.
}
```

#### Creating Custom TypedArrays

- `UintTypedArray(bits, be?)`: Create a typed array for unsigned integers of arbitrary bit width.
- `IntTypedArray(bits, be?)`: Create a typed array for signed integers of arbitrary bit width.
- `FloatTypedArray(F, be?)`: Create a typed array for custom floating-point formats.

#### Predefined Big-Endian Arrays

- `Uint16beArray`, `Uint32beArray`, `BigUint64beArray`
- `Int16beArray`, `Int32beArray`, `BigInt64beArray`
- `Float32beArray`, `Float64beArray`

#### Reinterpret TypedArrays (Zero-Copy)

These functions reinterpret the underlying buffer without copying:

- `as8(arg)`: Reinterpret as Uint8Array.
- `as16(arg, be?)`: Reinterpret as 16-bit unsigned integers.
- `as16s(arg, be?)`: Reinterpret as 16-bit signed integers.
- `as32(arg, be?)`: Reinterpret as 32-bit unsigned integers.
- `as32s(arg, be?)`: Reinterpret as 32-bit signed integers.
- `as64(arg, be?)`: Reinterpret as 64-bit unsigned bigints.
- `as64s(arg, be?)`: Reinterpret as 64-bit signed bigints.
- `asF32(arg, be?)`: Reinterpret as 32-bit floats.
- `asF64(arg, be?)`: Reinterpret as 64-bit floats.

### Text Encoding

`type TextEncoding = 'utf8' | 'utf16le' | 'utf16be'`

- `stringCode(s)`: Converts a string to a number by packing character codes (up to 4 chars).
- `stringCodeBig(s)`: Converts a string to a bigint by packing character codes.
- `encodeText(str, encoding?, bom?)`: Encodes a string to a Uint8Array with the specified encoding. Optional BOM.
- `encodeTextInto(str, into, encoding, bom?)`: Encodes a string directly into an existing TypedArray.
- `decodeText(buf, encoding?)`: Decodes a TypedArray to a string using the specified encoding.
- `decodeTextTo0(buf, encoding?)`: Decodes a TypedArray to a string, stopping at the first null terminator.
- `getTextEncoding(bytes)`: Detects text encoding from byte order mark or content analysis.

## License

This project is licensed under the MIT License.