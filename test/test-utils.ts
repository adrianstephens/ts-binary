import * as utils from '../dist/utils';

function rb() {
	return (Math.random() * 256) | 0;
}

function r32() {
	return (Math.random() * 0x100000000) >>> 0;
}

const Uint3Array = utils.UintTypedArray(3);

const b3 = new Uint3Array(new ArrayBuffer(12), 0, 32);

for (let i = 0; i < 32; i++)
	b3[i] = i;

for (const i of b3.subarray(7, 10))
	console.log(i);

for (const le of [false, true])
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

	utils.putUintBits(new DataView(arr.buffer), offset, val, bits, le);
	for (let i = 0; i < nbytes; i++)
		if (arr[i] !== expected[i])
			throw new Error(`putUintBits fail: le=${le} bits=${bits} offset=${offset}`);

	const got = utils.getUintBits(new DataView(arr.buffer), offset, bits, le) >>> 0;
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

	utils.putBigUintBits(new DataView(arr.buffer), offset, val, bits, le);
	for (let i = 0; i < nbytes; i++)
		if (arr[i] !== expected[i])
			throw new Error(`putBigUintBits fail: le=${le} bits=${bits} offset=${offset}`);

	const got = utils.getBigUintBits(new DataView(arr.buffer), offset, bits, le);
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
