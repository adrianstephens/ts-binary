# Complete Guide to @isopodlabs/binary Package

## Overview
The `@isopodlabs/binary` package is a TypeScript library for declarative binary data parsing and serialization. It allows developers to define binary data structures using simple type specifications and automatically handles reading/writing operations.

## Core Components

### 1. Stream System

#### `stream`
- Read-only stream from a Uint8Array buffer
- Manages position, endianness, and partially read results
- Provides methods for reading various data types

#### `growingStream` 
- Dynamically growing buffer for writing binary data
- Supports termination to get final byte array
- Used for building binary output

#### `dummyStream`
- For measuring sizes without actual I/O operations
- Useful for calculating required buffer space

### 2. Type System

#### Built-in Types
- Numeric types: UINT8, INT16_LE, UINT32_BE, etc.
- String types with encoding specification
- Buffer types for raw binary data

#### Composite Types
- Objects mapping field names to `Type` instances
- Arrays with variable lengths (count specified by field name, function, or constant)
- Optional fields based on bit flags or conditions
- Switch statements for different structures based on a value

### 3. Core Operations

#### Reading Data
```typescript
const stream = new binary.stream(data);
const myData = binary.read(stream, StructSpec);
```

#### Writing Data  
```typescript
const outStream = new binary.growingStream();
binary.write(outStream, StructSpec, value);
const bytes = outStream.terminate();
```

#### Measuring Size
```typescript
const size = binary.measure(type, data);
```

## Key Features

### Type Safety
- Fully inferred types from specifications
- Compile-time checking of data structures

### Bidirectional Operations
- Single specification for both reading and writing
- Consistent API across all operations

### Endianness Handling
- Endianness specified by the stream (`be` property)
- Built-in types have both little-endian (`_LE`) and big-endian (`_BE`) variants
- `endian_from_stream` function handles automatic endianness selection

### Memory Efficiency
- Stream-based approach avoids loading entire files into memory
- Supports async I/O streams

## Usage Patterns

### Basic Structure Definition
```typescript
const StructSpec = {
  x: binary.UINT16_LE,
  y: binary.StringType(binary.UINT8, 'utf8')
};
```

### Reading Complex Structures
```typescript
const stream = new binary.stream(data);
const myData = binary.read(stream, StructSpec);
```

### Writing Complex Structures
```typescript
const outStream = new binary.growingStream();
binary.write(outStream, StructSpec, value);
const bytes = outStream.terminate();
```

## Advanced Features

### Arrays with Variable Lengths
```typescript
const ArraySpec = {
  count: binary.UINT8,
  items: binary.Array(binary.UINT16_LE, 'count')
};
```

### Conditional Fields
Optional fields based on bit flags or conditions:
```typescript
const ConditionalSpec = {
  flags: binary.UINT8,
  data: binary.Conditional(
    (flags) => (flags & 0x01) !== 0,
    binary.UINT32_LE
  )
};
```

### Switch Statements
Different structures based on a value:
```typescript
const SwitchSpec = {
  type: binary.UINT8,
  data: binary.Switch('type', {
    0: binary.UINT16_LE,
    1: binary.UINT32_LE,
    2: binary.String(binary.UINT8, 'utf8')
  })
};
```

## Integration with Related Packages

### binary-libs
- Provides compression/decompression utilities
- Integrates with binary's stream system for handling compressed data formats
- Extends decompression capabilities with additional codecs (bzip2, xz, etc.)

### binary-fonts  
- Uses binary package for parsing font formats (TTF, OTF, WOFF, etc.)
- Implements font-specific readers that leverage the type system for structure definition
- Supports complex table-based formats through structured binary reading

### binary-bitmaps
- Implements bitmap format readers (BMP, PNG, JPEG, etc.)
- Utilizes binary's stream handling for efficient image data processing
- Leverages bitfield and array types for pixel data parsing

## Complete API Reference

### Stream Types
```typescript
// Create streams
const stream = new binary.stream(buffer);
const growingStream = new binary.growingStream();
const dummyStream = new binary.dummyStream();

// Stream operations
stream.tell();        // Get current position
stream.seek(pos);     // Seek to position
stream.skip(len);     // Skip bytes
stream.align(align);  // Align to boundary
```

### Numeric Types
```typescript
// 8-bit types
binary.UINT8, binary.INT8

// 16-bit types (LE/BE)
binary.UINT16_LE, binary.UINT16_BE
binary.INT16_LE, binary.INT16_BE
binary.UINT16, binary.INT16  // Endianness from stream

// 32-bit types (LE/BE)
binary.UINT32_LE, binary.UINT32_BE
binary.INT32_LE, binary.INT32_BE
binary.UINT32, binary.INT32   // Endianness from stream

// 64-bit types (LE/BE)
binary.UINT64_LE, binary.UINT64_BE
binary.INT64_LE, binary.INT64_BE
binary.UINT64, binary.INT64   // Endianness from stream

// Variable bit types
binary.UINT(bits), binary.INT(bits)  // bits must be multiple of 8
```

### String Types
```typescript
// Fixed length string
binary.String(length, encoding, zeroTerminated)

// Null-terminated string
binary.NullTerminatedString(encoding)

// Remaining string
binary.RemainingString(encoding)
```

### Array Types
```typescript
// Fixed length array
binary.Array(length, type)

// Remaining array (until end of stream)
binary.RemainingArray(type)
```

### Buffer Types
```typescript
// Fixed length buffer
binary.Buffer(length, view)

// Remaining buffer
binary.RemainingBuffer(view)
```

### Control Flow Types
```typescript
// Optional fields
binary.Optional(test, type, false_type)

// Conditional execution
binary.If(test, true_type, false_type)

// Switch based on value
binary.Switch(test, switches)

// Repeated structures
binary.Repeat(count, type)
```

### Utility Functions
```typescript
// Measure size needed for a type
binary.measure(type, data);

// Read multiple items
binary.readn(stream, type, count);

// Write multiple items  
binary.writen(stream, type, array);
```

## Best Practices

1. **Use Type Specifications**: Define all structures using type specifications for clarity and type safety
2. **Leverage Stream System**: Use streams for memory-efficient processing of large binary files
3. **Handle Endianness Explicitly**: Be aware of endianness requirements for your data formats
4. **Validate Input**: Always validate that streams have sufficient data before reading
5. **Measure Before Writing**: Use `measure()` to calculate buffer sizes when needed

## Example Usage Patterns

### Simple Structure Reading
```typescript
const FileHeader = {
  magic:   binary.UINT32_LE,
  version: binary.UINT16_LE,
  name:    binary.StringType(binary.UINT8, 'utf8')
};

const stream = new binary.stream(data);
const header = binary.read(stream, FileHeader);
```

### Writing Binary Data
```typescript
const outStream = new binary.growingStream();
binary.write(outStream, FileHeader, header);
const bytes = outStream.terminate();
```

This comprehensive guide provides everything needed to understand and use the @isopodlabs/binary package effectively. It covers core functionality, API details, usage patterns, and integration with related packages in the monorepo.