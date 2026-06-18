import * as float from '../dist/utilities/float';
import * as bit from '../dist/bit';
import * as bitfields from '../dist/utilities/bitfields';
import * as typedArray from '../dist/utilities/typedArray';

function assertClose(label: string, got: number, expected: number, rel = 1e-12, abs = 1e-12) {
	const diff = Math.abs(got - expected);
	const lim = Math.max(abs, Math.abs(expected) * rel);
	if (diff > lim)
		throw new Error(`${label}: got=${got} expected=${expected} diff=${diff} lim=${lim}`);
}

function rb() {
	return (Math.random() * 256) | 0;
}

function r32() {
	return (Math.random() * 0x100000000) >>> 0;
}         
const got = +float.float16(-1).pow(float.float16(1/3));

const fa = 1.1, fb = 2.3;
const a = float.float16(fa);
const b = float.float16(fb);
console.log(`a = ${a}, b = ${b}`);
console.log(`a + b = ${+a.add(b)} (${fa + fb})`);
console.log(`a - b = ${+a.sub(b)} (${fa - fb})`);
console.log(`a * b = ${+a.mul(b)} (${fa * fb})`);
console.log(`a / b = ${+a.div(b)} (${fa / fb})`);
console.log(`a % b = ${+a.mod(b)} (${fa % fb})`);
console.log(`a ** b = ${+a.pow(b)} (${fa ** fb})`);

for (const [x, y] of [
	[1.5, 2.25],
	[0.75, 3.5],
	[10, -0.5],
	[2, 10],
] as const) {
	const got = +(float.float16(x) as any).pow(float.float16(y));
	const expected = x ** y;
	assertClose(`float16 pow ${x}**${y}`, got, expected, 6e-2, 1e-3);
}

for (const [x, y] of [
	[1.5, 2.25],
	[1.0001, 10000],
	[0.9, -12.5],
	[2, 0.5],
] as const) {
	const got = +(float.float128(x) as any).pow(float.float128(y));
	const expected = x ** y;
	assertClose(`float128 pow ${x}**${y}`, got, expected, 1e-11, 1e-12);
}

console.log('OK: pow sanity assertions passed');

const Uint3Array = typedArray.Uint(41);
const b3 = new Uint3Array(32);

for (let i = 0; i < 32; i++)
	b3[i] = (i - 16);

for (const i of b3)
	console.log(i);


const Float16Array = typedArray.BitFields(float.float16);
const f16 = new Float16Array(new ArrayBuffer(64), 0, 32);
for (let i = 0; i < 32; i++)
	f16[i] = float.float16(i / 10);

for (const i of f16)
	console.log(+i);


const StructArray = typedArray.BitFields(bitfields.BitFields(0, {a:1, b:2, c:3} as const));
const sa = new StructArray(new ArrayBuffer(64), 0, 32);
for (let i = 0; i < 32; i++)
	sa[i] = {a: i & 1, b: (i >> 1) & 3, c: (i >> 3) & 7};

for (const i of sa)
	console.log(i);

for (const le of [true, false])
for (let bits = 1; bits <= 32; bits++)
for (let offset = 0; offset < 32; offset++)
for (let t = 0; t < 300; t++) {
	const nbytes = ((offset + bits + 7) >> 3) + 2;
	const arr = new Uint8Array(nbytes);
	for (let i = 0; i < nbytes; i++)
		arr[i] = rb();
	const expected = arr.slice();
	const val = bits === 32 ? r32() : (r32() & ((1 << bits) - 1));

	for (let i = 0; i < bits; i++) {
		const bi = offset + i;
		const by = bi >> 3;
		const bit = le ? (bi & 7) : (7 - (bi & 7));
		const m = 1 << bit;
		const b = (val >>> (le ? i : bits - 1 - i)) & 1;
		expected[by] = b ? (expected[by] | m) : (expected[by] & ~m);
	}

	bit.putUint(new DataView(arr.buffer), offset, val, bits, le);
	for (let i = 0; i < nbytes; i++)
		if (arr[i] !== expected[i])
			throw new Error(`putUintBits fail: le=${le} bits=${bits} offset=${offset}`);

	const got = bit.getUint(new DataView(arr.buffer), offset, bits, le) >>> 0;
	let exp = 0;
	for (let i = 0; i < bits; i++) {
		const bi = offset + i;
		const b = (arr[bi >> 3] >> (le ? (bi & 7) : (7 - (bi & 7)))) & 1;
		exp = le ? (exp | ((b << i) >>> 0)) : (((exp << 1) | b) >>> 0);
	}
	if ((got >>> 0) !== (exp >>> 0))
		throw new Error(`getUintBits fail: le=${le} bits=${bits} offset=${offset}`);
}

for (const le of [true, false])
for (let bits = 1; bits <= 96; bits++)
for (let offset = 0; offset < 32; offset++)
for (let t = 0; t < 180; t++) {
	const nbytes = ((offset + bits + 7) >> 3) + 2;
	const arr = new Uint8Array(nbytes);
	for (let i = 0; i < nbytes; i++)
		arr[i] = rb();
	const expected = arr.slice();
	let val = (BigInt(r32()) << 64n) ^ (BigInt(r32()) << 32n) ^ BigInt(r32());
	val &= (1n << BigInt(bits)) - 1n;

	for (let i = 0; i < bits; i++) {
		const bi = offset + i;
		const by = bi >> 3;
		const bit = le ? (bi & 7) : (7 - (bi & 7));
		const m = 1 << bit;
		const b = Number((val >> BigInt(le ? i : bits - 1 - i)) & 1n);
		expected[by] = b ? (expected[by] | m) : (expected[by] & ~m);
	}

	bit.putBigUint(new DataView(arr.buffer), offset, val, bits, le);
	for (let i = 0; i < nbytes; i++)
		if (arr[i] !== expected[i])
			throw new Error(`putBigUintBits fail: le=${le} bits=${bits} offset=${offset}`);

	const got = bit.getBigUint(new DataView(arr.buffer), offset, bits, le);
	let exp = 0n;
	for (let i = 0; i < bits; i++) {
		const bi = offset + i;
		const b = (arr[bi >> 3] >> (le ? (bi & 7) : (7 - (bi & 7)))) & 1;
		exp = le ? (exp | (BigInt(b) << BigInt(i))) : ((exp << 1n) | BigInt(b));
	}
	if (got !== exp)
		throw new Error(`getBigUintBits fail: le=${le} bits=${bits} offset=${offset}`);
}

console.log('OK: patched implementations validated');
