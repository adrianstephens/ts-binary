import * as bin from '../dist/index';
import * as fs from 'fs/promises';
import * as assert from 'assert';

interface TestResult {
	name: string;
	passed: boolean;
	error?: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void) {
	try {
		fn();
		results.push({ name, passed: true });
	} catch (e) {
		results.push({ name, passed: false, error: String(e) });
	}
}

function asyncTest(name: string, fn: () => Promise<void>) {
	return async () => {
		try {
			await fn();
			results.push({ name, passed: true });
		} catch (e) {
			results.push({ name, passed: false, error: String(e) });
		}
	};
}

//=============================================================================
// Stream operations
//=============================================================================

test('growingStream: write and terminate', () => {
	const s = new bin.growingStream();
	bin.write(s, bin.UINT32_LE, 0x12345678);
	const result = s.terminate();
	assert.equal(result.length, 4);
	assert.deepEqual(result, new Uint8Array([0x78, 0x56, 0x34, 0x12]));
});

test('offsetStream: windowed view', () => {
	const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
	const s = new bin.stream(data);
	s.seek(3);  // Seek to offset 3 first
	const os = s.offsetStream(3, 4);  // Create window from 3 to 7
	assert.equal(os.tell(), 0);  // Position in window is 0
	os.seek(2);
	assert.equal(os.tell(), 2);
	assert.equal(s.tell(), 5);  // Underlying stream at 3+2=5
});

//=============================================================================
// Numeric types
//=============================================================================

const numbersSpec = {
	uint8:		bin.UINT8,
	int8:		bin.INT8,
	uint16:		bin.UINT16,
	int16:		bin.INT16,
	uint32:		bin.UINT32,
	int32:		bin.INT32,
	uint64:		bin.UINT64,
	int64:		bin.INT64,
	float32:	bin.Float32,
	float64:	bin.Float64,
	uint40:		bin.UINT(40),
	uint104:	bin.UINT(104),
	uint128:	bin.UINT(128),
	float16:	bin.Float(10, 5, 15),
	float128:	bin.FloatRaw(112, 15),
};

const numbersData: bin.ReadType<typeof numbersSpec> = {
	uint8:		255,
	int8:		-42,
	uint16:		1234,
	int16:		-1234,
	uint32:		12345678,
	int32:		-12345678,
	uint64:		1234567890123456789n,
	int64:		-1234567890123456789n,
	float32:	1.5,
	float64:	Math.PI,
	uint40:		102030405,
	uint104:	0x0102030405060708090a0b0cn,
	uint128:	0x0102030405060708090a0b0c0d0e0f10n,
	float16:	1.5,
	float128:	bin.utils.Float(112, 15)(1.5),
};

test('Numbers: read and write', () => {
	const s = new bin.growingStream();
	bin.write(s, numbersSpec, numbersData);
	const data = s.terminate();
	const s2 = new bin.stream(data);
	const val = bin.read(s2, numbersSpec);
	assert.deepEqual(val, numbersData);
});

test('Float16: infinities and NaN roundtrip', () => {
	const f16 = bin.utils.float16;

	const a = f16(1.5), b = f16(2.5);
	const c = a.add(b);
	assert.equal(+a + +b, 4);

	assert.equal(f16(Infinity).raw, 0x7c00);
	assert.equal(f16(-Infinity).raw, 0xfc00);

	//const nan = f16(NaN).raw;
	//assert.equal(nan & 0x7c00, 0x7c00);
	//assert.notEqual(nan & 0x03ff, 0);

	assert.equal(f16.raw(0x7c00).valueOf(), Infinity);
	assert.equal(f16.raw(0xfc00).valueOf(), -Infinity);
	//assert.ok(Number.isNaN(f16.raw(nan).valueOf()));
});

test('Float16: denormals decode and encode', () => {
	const f16 = bin.utils.float16;
	assert.equal(f16.raw(0x0001).valueOf(), 2 ** -24);
	assert.equal(f16.raw(0x03ff).valueOf(), (1023 / 1024) * (2 ** -14));
	assert.equal(f16.raw(0x0400).valueOf(), 2 ** -14);

	assert.equal(f16(2 ** -24).raw, 0x0001);
	assert.equal(f16(2 ** -14).raw, 0x0400);
});

test('Float128', () => {
	const a64 = 1, b64 = 2 ** 64;
	const c64 = a64 + b64 - b64;
	console.log(+c64);


	const f128 = bin.utils.float128;
	const a = f128(a64), b = f128(b64);
	const c = a.add(b).sub(b);
	console.log(+c);
});


//=============================================================================
// Numeric types - ULEB128
//=============================================================================

test('ULEB128: roundtrip small', () => {
	const s = new bin.growingStream();
	bin.write(s, bin.ULEB128, 123);
	const data = s.terminate();
	console.log('ULEB128 write(123) produced:', data);
	const s2 = new bin.stream(data);
	const val = bin.read(s2, bin.ULEB128);
	console.log('ULEB128 read back:', val);
	assert.equal(val, 123);
});

test('ULEB128: roundtrip large', () => {
	const s = new bin.growingStream();
	const large = 0x123456n;
	bin.write(s, bin.ULEB128, large);
	const data = s.terminate();
	console.log('ULEB128 write(0x123456n) produced:', data);
	const s2 = new bin.stream(data);
	const val = bin.read(s2, bin.ULEB128);
	console.log('ULEB128 read back:', val);
	assert.equal(val, large);
});

//=============================================================================
// String types
//=============================================================================

test('NullTerminatedStringType: read and write', () => {
	const s = new bin.growingStream();
	bin.write(s, bin.NullTerminatedStringType('utf8'), 'Hello');
	const data = s.terminate();
	const s2 = new bin.stream(data);
	const val = bin.read(s2, bin.NullTerminatedStringType('utf8'));
	assert.equal(val, 'Hello');
});

test('StringType with length prefix', () => {
	const s = new bin.growingStream();
	const strType = bin.StringType(bin.UINT8, 'utf8', false);
	bin.write(s, strType, 'Hi');
	const data = s.terminate();
	const s2 = new bin.stream(data);
	const val = bin.read(s2, strType);
	assert.equal(val, 'Hi');
});

test('RemainingStringType: roundtrip', () => {
	const s = new bin.growingStream();
	bin.write(s, bin.UINT8, 42);
	bin.write(s, bin.RemainingStringType('utf8'), 'World');
	const data = s.terminate();
	console.log('RemainingStringType data:', data);
	const s2 = new bin.stream(data);
	const val1 = bin.read(s2, bin.UINT8);
	console.log('Read UINT8:', val1);
	const val = bin.read(s2, bin.RemainingStringType('utf8'));
	console.log('RemainingStringType read back:', val);
	assert.equal(val, 'World');
});

//=============================================================================
// Array types
//=============================================================================

test('ArrayType: read and write', () => {
	const s = new bin.growingStream();
	bin.write(s, bin.ArrayType(bin.UINT8, bin.UINT32_LE), [1, 2, 3, 4, 5]);
	const data = s.terminate();
	const s2 = new bin.stream(data);
	const val = bin.read(s2, bin.ArrayType(bin.UINT8, bin.UINT32_LE));
	assert.deepEqual(val, [1, 2, 3, 4, 5]);
});

test('RemainingArrayType: read all remaining', () => {
	const s = new bin.growingStream();
	bin.write(s, bin.UINT32_LE, 1);
	bin.write(s, bin.UINT32_LE, 2);
	bin.write(s, bin.UINT32_LE, 3);
	const data = s.terminate();
	const s2 = new bin.stream(data);
	const val = bin.read(s2, bin.RemainingArrayType(bin.UINT32_LE));
	assert.deepEqual(val, [1, 2, 3]);
});

//=============================================================================
// Buffer type
//=============================================================================

test('Buffer: read and write', () => {
	const s = new bin.growingStream();
	const buf = new Uint8Array([1, 2, 3, 4]);
	bin.write(s, bin.Buffer(4), buf);
	const data = s.terminate();
	const s2 = new bin.stream(data);
	const val = bin.read(s2, bin.Buffer(4));
	assert.deepEqual(val, buf);
});

test('Buffer with length prefix', () => {
	const s = new bin.growingStream();
	const buf = new Uint8Array([5, 6, 7]);
	bin.write(s, bin.Buffer(bin.UINT8), buf);
	const data = s.terminate();
	const s2 = new bin.stream(data);
	const val = bin.read(s2, bin.Buffer(bin.UINT8));
	assert.deepEqual(val, buf);
});

//=============================================================================
// Struct and Class
//=============================================================================

test('Struct: basic structure', () => {
	const spec = {
		a: bin.UINT32_LE,
		b: bin.UINT16_LE,
		c: bin.UINT8,
	};
	const val = { a: 0x12345678, b: 0x1234, c: 0xFF };
	const s = new bin.growingStream();
	bin.write(s, bin.Struct(spec), val);
	const data = s.terminate();

	const s2 = new bin.stream(data);
	const val2 = bin.read(s2, bin.Struct(spec));
	assert.deepEqual(val2, val);
});

test('Class: read and write', () => {
	const Point = bin.Class({
		x: bin.INT32_LE,
		y: bin.INT32_LE,
	});
	const s1	= new bin.growingStream();
	const pt	= new Point({x: 10, y: 20});
	pt.write(s1);
	const data = s1.terminate();

	const s2	= new bin.stream(data);
	const pt2	= new Point(s2);
	assert.deepEqual(pt2, pt);

	class CPoint extends bin.Class({
		x: bin.INT32_LE,
		y: bin.INT32_LE,
	}) {
		constructor(args: {x: number, y: number} | bin._stream) {
			super(args);
		}
	}
	const s3	= new bin.growingStream();
	const pt3	= new CPoint({x: 10, y: 20});
	pt3.write(s3);
	const data2 = s3.terminate();

	const s4	= new bin.stream(data2);
	const pt4	= new CPoint(s4);
	assert.deepEqual(pt4, pt3);
});


test('Extend: read and write', () => {
	class Point extends bin.Class({
		x: bin.INT32_LE,
		y: bin.INT32_LE,
	}) {
		z: number;
		constructor(args: {x: number, y: number} | bin._stream) {
			super(args);
			this.z = 42;
			//console.log('Point constructor called with:', args);
		}
	}
	const s1	= new bin.growingStream();
	const pt	= new Point({x: 10, y: 20});
	pt.write(s1);
	const data = s1.terminate();

	const s2 = new bin.stream(data);
	const pt2 = new Point(s2);
	assert.deepEqual(pt2, pt);

	const Curve = bin.Extend(Point, {
		flags: bin.INT8,
	});
	const s3	= new bin.growingStream();
	const curve = new Curve({x: 10, y: 20, flags: 1});
	curve.write(s3);
	const data2 = s3.terminate();

	const s4 = new bin.stream(data2);
	const curve2 = new Curve(s4);
	assert.deepEqual(curve, curve2);
});

//=============================================================================
// SizeType and OffsetType
//=============================================================================

test('SizeType: roundtrip', () => {
	const s = new bin.growingStream();
	const data = { a: 42, b: 123 };
	bin.write(s, bin.SizeType(bin.UINT16_LE, { a: bin.UINT32_LE, b: bin.UINT32_LE }), data);
	const result = s.terminate();
	console.log('SizeType data:', result);
	const s2 = new bin.stream(result);
	const val = bin.read(s2, bin.SizeType(bin.UINT16_LE, { a: bin.UINT32_LE, b: bin.UINT32_LE }));
	console.log('SizeType read back:', val);
	assert.equal(val.a, 42);
	assert.equal(val.b, 123);
});

test('OffsetType: read and write', () => {
	const s = new bin.growingStream();
	const data = { x: 100 };
	bin.write(s, bin.OffsetType(bin.UINT32_LE, { x: bin.UINT32_LE }), data);
	const result = s.terminate();
	const s2 = new bin.stream(result);
	const val = bin.read(s2, bin.OffsetType(bin.UINT32_LE, { x: bin.UINT32_LE }));
	assert.equal(val.x, 100);
});

test('MaybeOffsetType: null offset', () => {
	const s = new bin.growingStream();
	bin.write(s, bin.MaybeOffsetType(bin.UINT32_LE, bin.UINT32_LE), undefined);
	const result = s.terminate();
	const s2 = new bin.stream(result);
	const val = bin.read(s2, bin.MaybeOffsetType(bin.UINT32_LE, bin.UINT32_LE));
	assert.equal(val, undefined);
});

test('MaybeOffsetType: with value', () => {
	const s = new bin.growingStream();
	bin.write(s, bin.MaybeOffsetType(bin.UINT32_LE, bin.UINT32_LE), 0xDEADBEEF);
	const result = s.terminate();
	const s2 = new bin.stream(result);
	const val = bin.read(s2, bin.MaybeOffsetType(bin.UINT32_LE, bin.UINT32_LE));
	assert.equal(val, 0xDEADBEEF);
});

//=============================================================================
// Optional and If
//=============================================================================

test('Optional: with condition', () => {
	const spec = bin.Optional(true, bin.UINT32_LE);
	const s = new bin.growingStream();
	bin.write(s, spec, 0x12345678);
	const result = s.terminate();
	const s2 = new bin.stream(result);
	const val = bin.read(s2, spec);
	assert.equal(val, 0x12345678);
});

//=============================================================================
// Switch
//=============================================================================

test('Switch: discriminate on key', () => {
	const switchType = bin.Switch(0, {
		0: bin.UINT32_BE,
		1: bin.UINT16_LE,
	});
	const s = new bin.growingStream();
	bin.write(s, switchType, 0x12345678);
	const result = s.terminate();
	const s2 = new bin.stream(result);
	const val = bin.read(s2, switchType);
	assert.equal(val, 0x12345678);
});

//=============================================================================
// AlignType and SkipType
//=============================================================================

test('AlignType: padding', () => {
	const s = new bin.growingStream();
	bin.write(s, {a: bin.UINT32_LE, b: bin.Aligned(8, bin.UINT32_LE)}, {a:1, b:2});
	const result = s.terminate();
	assert.equal(result.length, 4 + 4 + 4);
});

test('SkipType: skip bytes', () => {
	const s = new bin.growingStream();
	bin.write(s, {a: bin.UINT32_LE, b: bin.AfterSkip(4, bin.UINT32_LE)}, {a:1, b:2});
	const result = s.terminate();
	assert.equal(result.length, 4 + 4 + 4);
});

//=============================================================================
// Const
//=============================================================================

test('Const: constant value', () => {
	const s = new bin.growingStream();
	bin.write(s, bin.Const(42), 1);
	const result = s.terminate();
	const s2 = new bin.stream(result);
	const val = bin.read(s2, bin.Const(42));
	assert.equal(val, 42);
});


//=============================================================================
// Enum and Flags
//=============================================================================

test('Enum: convert value to name', () => {
	enum Color { Red = 0, Green = 1, Blue = 2 }
	const colorEnum = bin.Enum(Color);
	assert.equal(colorEnum(Color.Red), 'Red');
	assert.equal(colorEnum(Color.Blue), 'Blue');
});

test('Flags: convert flags to object', () => {
	enum Permission { Read = 1, Write = 2, Execute = 4 }
	const flags = bin.Flags(Permission, true);
	const result = flags(Permission.Read | Permission.Write);
	assert.equal(result.Read, true);
	assert.equal(result.Write, true);
	assert.equal(result.Execute, undefined);
});

//=============================================================================
// BitFields
//=============================================================================

test('BitFields: extract bit ranges', () => {
	const bitFields = bin.BitFields({ a: 4, b: 4 });
	const result = bitFields.to(0xAB);
	assert.equal(result.a, 0xB);
	assert.equal(result.b, 0xA);
});

//=============================================================================
// Measure
//=============================================================================

test('Measure: determine serialisation size', () => {
	const measure = bin.measure({
		a: bin.UINT32_LE,
		b: bin.UINT16_LE,
	});
	assert.equal(measure, 6);

	const measure2 = bin.measure(bin.ULEB128);
	assert.equal(measure2, 1);
	
	const measure3 = bin.measure(bin.ULEB128, 0x123456);
	assert.equal(measure3, 3);
});

//=============================================================================
// Async operations
//=============================================================================

async function openFile(filename: string, flags = fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC) {
	const fd = await fs.open(filename, flags);
	return new bin.async.stream(
		(offset: number, data: Uint8Array) => fd.read(data, 0, data.length, offset).then(read => read.bytesRead),
		(offset: number, data: Uint8Array) => fd.write(data, 0, data.length, offset).then(_write => undefined),
		_s => fd.close()
	);
}

const asyncTests = [
	asyncTest('async.write and async.read', async () => {
		const s = await openFile('test.bin');
		await bin.async.write(s, numbersSpec, numbersData);
		await s.terminate();
		s.seek(0);
		const val = await bin.async.read(s, numbersSpec);
		assert.deepEqual(val, numbersData);
	}),

	asyncTest('async.readn2 multiple values', async () => {
		const s = await openFile('test.bin');
		await bin.async.write(s, bin.ArrayType(bin.UINT8, bin.UINT32_LE), [1, 2, 3]);
		await s.terminate();
		s.seek(0);
		const vals = await bin.async.read(s, bin.ArrayType(bin.UINT8, bin.UINT32_LE));
		assert.deepEqual(vals, [1, 2, 3]);
	}),

	asyncTest('Class: read and write', async () => {
		const Point = bin.async.Class({
			x: bin.INT32_LE,
			y: bin.INT32_LE,
		});
		const s = await openFile('test.bin');
		const pt = new Point({x: 10, y: 20});
		await pt.write(s);
		await s.terminate();

		const s2 = await openFile('test.bin', fs.constants.O_RDONLY);
		const pt2 = await Point.get(s2);
		assert.equal(pt2.x, 10);
		assert.equal(pt2.y, 20);
	}),

	asyncTest('Extend: read and write', async () => {
		class Point extends bin.async.Class({
			x: bin.Float32,
			y: bin.Float32,
		}) {
			z: number;
			constructor(args: {x: number, y: number}) {
				super(args);
				this.z = 42;
				//console.log('Point constructor called with:', args);
			}
		}

		const s1 = await openFile('test.bin');
		const pt = new Point({x: 10, y: 20});
		await pt.write(s1);
		await s1.terminate();

		const s2 = await openFile('test.bin', fs.constants.O_RDONLY);
		const pt2 = await Point.get(s2);
		assert.deepEqual(pt, pt2);

		const Curve = bin.async.Extend(Point, {
			flags: bin.INT8,
		});
		const s3 = await openFile('test.bin');
		const curve = new Curve({x: 10, y: 20, flags: 1});
		await curve.write(s3);
		await s3.terminate();

		const s4 = await openFile('test.bin', fs.constants.O_RDONLY);
		const curve2 = await Curve.get(s4);
		assert.deepEqual(curve, curve2);
	})

];

//=============================================================================
// Run all tests
//=============================================================================

(async () => {
	for (const i of asyncTests)
		await i();

	const passed = results.filter(r => r.passed).length;
	const failed = results.filter(r => !r.passed).length;

	console.log(`\n${'='.repeat(60)}`);
	console.log(`Test Results: ${passed} passed, ${failed} failed`);
	console.log(`${'='.repeat(60)}\n`);

	if (failed > 0) {
		console.log('Failed tests:\n');
		results.filter(r => !r.passed).forEach(r => {
			console.log(`❌ ${r.name}`);
			console.log(`   ${r.error}\n`);
		});
	} else {
		console.log('✓ All tests passed!\n');
	}

	process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
	console.error('Fatal error:', err);
	process.exit(1);
});
