# @isopodlabs/binary
[![npm version](https://img.shields.io/npm/v/@isopodlabs/binary.svg)](https://www.npmjs.com/package/@isopodlabs/binary)
[![GitHub stars](https://img.shields.io/github/stars/adrianstephens/binary.svg?style=social)](https://github.com/adrianstephens/binary)
[![License](https://img.shields.io/npm/l/@isopodlabs/binary.svg)](LICENSE.txt)

A TypeScript library for declarative binary data parsing and serialization. Define your binary structures with simple type specifications and let the library handle reading/writing.

## ☕ Support My Work  
If you use this package, consider [buying me a cup of tea](https://coff.ee/adrianstephens) to support future updates!  

## Quick Start

```typescript
import * as bin from '@isopodlabs/binary';

// Define structure declaratively
const FileHeader = {
    magic:   bin.UINT32_LE,
    version: bin.UINT16_LE,
    name:    bin.StringType(bin.UINT8, 'utf8')
};

// Read from binary data
const stream = new bin.stream(data);
const header = bin.read(stream, FileHeader);
// => {magic: 0x12345678, version: 1, name: "MyFile"}

// Write back to binary
const outStream = new bin.growingStream();
bin.write(outStream, FileHeader, header);
const bytes = outStream.terminate();
```

## Why Choose This Library?

**vs binary-parser**
- ✅ Declarative object syntax instead of method chaining
- ✅ Full TypeScript inference (no manual type annotations)
- ✅ Bidirectional (read + write) vs read-only
- ✅ Native async stream support
- ✅ Dynamic field references: `s => s.obj.length` vs string-based `{length: 'length'}`

**vs restructure**:
- ✅ Modern TypeScript-first design
- ✅ Advanced features: async, custom float formats, bitfields
- ✅ Class integration with `bin.Class()`

**Key advantages**:
- **Type safety**: Fully inferred types from specifications
- **Bidirectional**: Single spec for both reading and writing
- **Advanced types**: Custom floats, offset pointers, bitfields, conditional fields
- **Class integration**: Extend with methods while keeping serialization
- **Async native**: Built-in support for async I/O streams

## Common Patterns

### Reading File Headers with Magic Numbers

```typescript
// With length field for later use
const PNGChunk = {
    length: bin.UINT32_BE,
    type:   bin.Expect(bin.StringType(4, 'utf8'), "\x89PNG"),
    data:   bin.Buffer(s => s.obj.length),
    crc:    bin.UINT32_BE
};

// Or read length inline (no length field in result)
const SimpleChunk = {
    data:   bin.Buffer(bin.UINT32_BE),  // Read size, then buffer
    crc:    bin.UINT32_BE
};
```

### Variable-Length Arrays

```typescript
// When you need the count as a field
const MessageSpec = {
    count:   bin.UINT16_LE,
    // Array length comes from the 'count' field
    items:   bin.ArrayType(s => s.obj.count, {
        id:   bin.UINT32_LE,
        text: bin.StringType(bin.UINT8, 'utf8')
    })
};

// When count is only needed for the array (cleaner)
const MessageSpec2 = {
    // Reads count inline: no 'count' field in result
    items:   bin.ArrayType(bin.UINT16_LE, {
        id:   bin.UINT32_LE,
        text: bin.StringType(bin.UINT8, 'utf8')
    })
};
```

### Conditional Fields

```typescript
const Record = {
    flags: bin.UINT8,
    // Only read 'extra' if flags has bit 0 set
    extra: bin.Optional(s => s.obj.flags & 1, bin.UINT32_LE)
};

// Different types based on a value
const Packet = {
    type: bin.UINT8,
    payload: bin.Switch(s => s.obj.type, {
        1: {x: bin.Float32, y: bin.Float32},
        2: {message: bin.StringType(bin.UINT16_LE, 'utf8')},
        3: {data: bin.Buffer(64)}
    })
};
```

### Working with Enums and Flags

```typescript
enum FileType { Text = 1, Binary = 2, Compressed = 3 }
enum Permissions { Read = 1, Write = 2, Execute = 4 }

const FileInfo = {
    type:  bin.asEnum(bin.UINT8, FileType),
    perms: bin.asFlags(bin.UINT8, Permissions)
};

const info = bin.read(stream, FileInfo);
// => {type: FileType.Binary, perms: {Read: true, Write: false, Execute: true}}
```

### Using Classes for Adding Methods

```typescript
class Point extends bin.Class({
    x: bin.Float32,
    y: bin.Float32
}) {
    distance() {
        return Math.sqrt(this.x ** 2 + this.y ** 2);
    }
}

// Read directly into class instances
const point = Point.get(stream);// or new Point(stream);
console.log(point.distance());

// Extend with additional fields
const Point3D = bin.Extend(Point, {
    z: bin.Float32
});
```

## Core Concepts

### Streams

Streams manage reading/writing position and endianness:

- `stream(data, be?)`: Read from a Uint8Array
- `growingStream()`: Dynamically growing buffer for writing

Streams expose:
- `tell()`: Get current position
- `seek(offset)`: Set position
- `view(type, len)`: Read a buffer

### Types

A `Type` specifies how to serialize data. Types can be:

1. **Built-in types**: `UINT32_LE`, `StringType(...)`, `ArrayType(...)`, etc.
2. **Objects**: `{x: UINT16, y: UINT16}` reads/writes structured data
3. **Arrays**: `[UINT8, UINT16, UINT32]` reads/writes tuples

### TypeX (Dynamic Values)

`TypeX` parameters accept three forms:

```typescript
// 1. Constant
bin.ArrayType(4, bin.UINT32)  // Always 4 elements

// 2. Read from stream
bin.ArrayType(bin.UINT16_LE, bin.UINT32)  // Read length, then array

// 3. Computed function
bin.ArrayType(s => s.obj.count, bin.UINT32)  // Use previous field
```

The `s.obj` property provides access to already-read fields. Nested objects can access parent fields via `s.obj.obj`.


## Type Reference

### Numeric Types

**Integers** - Use suffixes `_LE` (little-endian) or `_BE` (big-endian), otherwise endianness is specified by the stream:
- `UINT8`, `INT8`: 8-bit integers
- `UINT16`, `INT16`: 16-bit integers  
- `UINT32`, `INT32`: 32-bit integers
- `UINT64`, `INT64`: 64-bit integers (bigints)
- `UINT(bits, be?)`, `INT(bits, be?)`: Custom bit widths (multiple of 8)
- `ULEB128`: Variable-length LEB128 encoding

**Floats**:
- `Float32`, `Float64`: IEEE 754 floating-point
- `Float(mbits, ebits, ebias?, sbit?, be?)`: Custom float formats

### String Types

- `StringType(len, encoding?, zeroTerminated?, lenScale?)`: Specified length string
- `NullTerminatedStringType(encoding?)`: Read until null byte
- `RemainingStringType(encoding?, zeroTerminated?)`: Read rest of stream

Encodings: `'utf8'`, `'utf16le'`, `'utf16be'`

### Array Types

- `ArrayType(len, type)`: Specified length array
- `RemainingArrayType(type)`: Read rest of stream as array

### Buffer Types

- `Buffer(len, view?)`: Raw bytes as TypedArray (default: Uint8Array)
- `Remainder`: Read rest of stream as Uint8Array

### Structural Types

- `Struct(spec)`: Explicit struct (usually inferred from objects)
- `Class(spec)`: See below
- `Extend(spec)`: See below

### Conditional Types

- `Optional(test, type, falseType?)`: Conditionally read type
- `If(test, trueType, falseType?)`: Branch and merge into parent
- `Switch(test, switches)`: Multi-way branch by key

### Offset Types

- `OffsetType(offset, type)`: Jump to offset, read, return to position
- `MaybeOffsetType(offset, type)`: Returns `undefined` if offset is 0
- `SizeType(len, type)`: Limit read to specific byte count
- `AlignType(align)`: Align to byte boundary
- `SkipType(len)`: Skip bytes

### Meta Types

- `Const(value)`: Always returns constant
- `Func(func)`: Call function for value
- `FuncType(func)`: Dynamically determine type
- `Discard(type)`: Read and discard
- `Expect(type, value)`: Assert value matches
- `DontRead<T>()`: Placeholder (doesn't read/write)

## Transformations

Transform parsed values with `as(type, maker, from?)`:

```typescript
// Convert hex string to number
const hexValue = bin.as(
    bin.StringType(4, 'utf8'),
    s => parseInt(s, 16),
    n => n.toString(16).padStart(4, '0')
);

// Parse array into named object
const RGB = bin.as(
    [bin.UINT8, bin.UINT8, bin.UINT8],
    ([r, g, b]) => ({r, g, b}),
    ({r, g, b}) => [r, g, b]
);
```

**Predefined transformations:**
- `asHex(type)`: Display as hex string
- `asInt(type, radix?)`: Parse string as integer
- `asFixed(type, fracbits)`: Fixed-point decimal
- `asEnum(type, enum)`: Map to enum value
- `asFlags(type, enum, noFalse?)`: Decode bitmask to flags object

**Enum & Flags:**
```typescript
enum Status { Idle = 0, Running = 1, Stopped = 2 }
const status = bin.asEnum(bin.UINT8, Status);

enum Flags { Read = 1, Write = 2, Execute = 4 }
const perms = bin.asFlags(bin.UINT8, Flags);  // => {Read: true, Write: false, Execute: true}
```

**BitFields:**
```typescript
const Header = bin.BitFields({
    version: 4,        // 4 bits
    type:    8,        // 8 bits
    flags:   [4, bin.Flags(MyFlags)],  // 4 bits as flags
    reserved: 16       // 16 bits
});
```

**Named Arrays:**
```typescript
// Array to named tuples
const points = bin.arrayWithNames(
    bin.ArrayType(3, {x: bin.Float32, y: bin.Float32}),
    (pt, i) => `point${i}`
);  // => [["point0", {x, y}], ["point1", {x, y}], ...]

// Array to keyed object
const lookup = bin.objectWithNames(
    bin.ArrayType(bin.UINT8, {id: bin.UINT16, name: bin.StringType(bin.UINT8)}),
    item => item.name
);  // => {alice: {id, name}, bob: {id, name}, ...}
```


## Classes

Generate classes with automatic serialization using `Class(spec)` or `Extend(base, spec)`.

### Basic Classes

```typescript
const Point = bin.Class({
    x: bin.Float32,
    y: bin.Float32
});

// Create from data
const p1 = new Point({x: 10, y: 20});

// Read from stream
const p2 = Point.get(stream);//or new Point(stream)

// Write to stream
p1.write(stream);
// or
Point.put(stream, p1);
```

### Extending Classes

```typescript
class Point extends bin.Class({
    x: bin.Float32,
    y: bin.Float32
}) {
    // Add custom methods
    distance() {
        return Math.sqrt(this.x ** 2 + this.y ** 2);
    }
    
    // Optional custom constructor
    constructor(arg: {x: number, y: number} | bin._stream) {
        super(arg);
    }
}

// Extend with more fields
const Point3D = bin.Extend(Point, {
    z: bin.Float32
});

const p3d = new Point3D({x: 1, y: 2, z: 3});
```

### Practical Example: File Format

```typescript
class BMPHeader extends bin.Class({
    magic:      bin.StringType(2, 'utf8'),
    fileSize:   bin.UINT32_LE,
    reserved:   bin.UINT32_LE,
    dataOffset: bin.UINT32_LE,
    headerSize: bin.UINT32_LE,
    width:      bin.INT32_LE,
    height:     bin.INT32_LE,
    planes:     bin.UINT16_LE,
    bitsPerPixel: bin.UINT16_LE
}) {
    validate() {
        if (this.magic !== 'BM') throw new Error('Not a BMP file');
        if (this.planes !== 1) throw new Error('Invalid BMP');
    }
}

const header = BMPHeader.get(stream);
header.validate();
```

## Async API

All synchronous types work with async streams. The package exports `binary.async` with async-aware functions.

```typescript
import * as bin from '@isopodlabs/binary';
import * as fs from 'fs/promises';

async function openFile(filename: string, flags = fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC) {
	const fd = await fs.open(filename, flags);
	return new bin.async.stream(
		(offset: number, data: Uint8Array) => fd.read(data, 0, data.length, offset).then(read => read.bytesRead),
		(offset: number, data: Uint8Array) => fd.write(data, 0, data.length, offset).then(_write => undefined),
		_s => fd.close()
	);
}

// Use with async read/write
const stream = openFile('data.bin');
const data = await bin.async.read(stream, MySpec);

// async Classes
class AsyncRecord extends bin.async.Class({
    id: bin.UINT32_LE,
    data: bin.Buffer(256)
}) {}

const record = await AsyncRecord.get(stream);//Note: cannot use new AsyncRecord(stream) because constructors can't be async
await record.write(outStream);
```


## Utilities

The `binary.utils` namespace provides low-level utilities:

### Bit Operations
`isPow2`, `lowestSet`, `highestSetIndex`, `bitCount`, `splitBinary`, etc.

### Integer I/O
`getUint`, `getInt`, `getBigUint`, `putUint`, `putBigUint` - Read/write arbitrary-sized integers from DataViews.

### Custom Floats
`Float(mbits, ebits, ebias?, sbit?)` - Define custom floating-point formats.
Predefined: `float8_e4m3`, `float8_e5m2`, `float16`

### TypedArray Extensions
- `UintTypedArray(bits, be?)`, `IntTypedArray(bits, be?)` - Arbitrary bit-width arrays
- `Uint16beArray`, `Float32beArray`, etc. - Big-endian variants
- `as8`, `as16`, `as32`, `asF32`, etc. - Zero-copy reinterpret casts

### Text Encoding
`encodeText`, `decodeText`, `decodeTextTo0`, `getTextEncoding` - UTF-8/UTF-16 encoding.

See the [source code](src/utils.ts) for complete API documentation.

## Advanced Topics

### Custom Streams

Implement `_stream` interface for custom data sources:

```typescript
class MemoryMappedStream implements bin._stream {
    private offset = 0;
    
    tell() { return this.offset; }
    seek(offset: number) { this.offset = offset; }
    
    view<T>(type: ViewMaker<T>, len: number): T {
        const view = new type(this.buffer, this.offset, len);
        this.offset += len * (type.BYTES_PER_ELEMENT ?? 1);
        return view;
    }
}
```

### Big-Endian Mode

Set `be` property on stream for default endianness:

```typescript
const stream = new bin.stream(data);
stream.be = true;  // All reads now default to big-endian

// Or per-type
const value = bin.read(stream, bin.UINT32_BE);
```

### Offset Tables and Pointers

Common pattern for reading offset-based structures:

```typescript
const FileWithOffsets = {
    header: {
        stringTableOffset: bin.UINT32_LE,
        dataOffset: bin.UINT32_LE
    },
    // Jump to offset, read data, return to original position
    stringTable: bin.OffsetType(
        s => s.obj.header.stringTableOffset,
        bin.ArrayType(bin.UINT16_LE, bin.NullTerminatedStringType())
    ),
    data: bin.OffsetType(
        s => s.obj.header.dataOffset,
        bin.Buffer(1024)
    )
};
```

### Performance Tips

- Use `Buffer()` instead of `RemainingArrayType(UINT8)` for raw bytes - it's faster
- Reuse stream instances rather than creating new ones
- For large files, consider async streams to avoid loading entire file into memory
- Use classes for frequently-parsed structures - they're optimized
- Avoid deep nesting in type specs - flatten where possible

## License

This project is licensed under the MIT License.